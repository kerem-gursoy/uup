import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ScanLine, X } from 'lucide-react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';
import {
    BARCODE_VIDEO_CONSTRAINTS,
    cameraUnavailableReason,
    describeCameraError,
} from '../lib/camera';
import { Button } from './ui';

type Phase = 'starting' | 'scanning' | 'error';

/**
 * Barcode scanner, presented as a floating panel rather than a full-screen
 * takeover: the shop screen stays visible behind it, so it reads as a step in
 * whatever the user was already doing instead of a separate mode.
 *
 * This is the one place in the app that talks to the camera, so the stream
 * lifecycle is only got right once: a single `getUserMedia` call with our own
 * rear-camera constraints, handed to `decodeFromStream`, which also releases it
 * when the returned controls are stopped. Opening a second capture on the same
 * camera (which `decodeFromVideoDevice` does) fails outright on some phones, and
 * on iOS ends the first capture, leaving a frozen preview that never decodes.
 *
 * `onDetected` fires at most once; the parent decides what happens next.
 */
export default function BarcodeScanner({
    title = 'Scan a barcode',
    hint = 'Hold the barcode inside the frame',
    onDetected,
    onClose,
}: {
    title?: string;
    hint?: string;
    onDetected: (barcode: string) => void;
    onClose: () => void;
}) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const detectedRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('starting');
    const [error, setError] = useState<string | null>(null);

    // Escape closes the panel, as it would any dialog.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    // Stop the page behind from scrolling while the panel is up.
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const stop = () => {
            controlsRef.current?.stop();
            controlsRef.current = null;
        };

        const start = async () => {
            const unavailable = cameraUnavailableReason();
            if (unavailable) {
                setError(unavailable);
                setPhase('error');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia(
                    BARCODE_VIDEO_CONSTRAINTS
                );

                // Unmounted while the permission prompt was open.
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                const reader = new BrowserMultiFormatReader();

                controlsRef.current = await reader.decodeFromStream(
                    stream,
                    videoRef.current ?? undefined,
                    (result, err) => {
                        if (detectedRef.current) return;

                        if (result) {
                            const text = result.getText().trim();
                            if (text) {
                                detectedRef.current = true;
                                stop();
                                onDetected(text);
                            }
                            return;
                        }

                        // NotFoundException fires for every frame without a
                        // barcode, which is most of them.
                        if (err && !(err instanceof NotFoundException)) {
                            console.warn('Scan error:', err);
                        }
                    }
                );

                if (cancelled) {
                    stop();
                    return;
                }

                setPhase('scanning');
            } catch (err) {
                console.error('Error starting camera:', err);
                if (cancelled) return;
                setError(describeCameraError(err));
                setPhase('error');
            }
        };

        void start();

        return () => {
            cancelled = true;
            stop();
        };
        // Starting the camera must happen once per mount. onDetected and hint are
        // read at fire time, so changes to them must not restart the camera.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Portalled to <body> for the same reason as Modal: the pages that open the
    // scanner are forms, and a nested form breaks submission.
    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-backdrop-in p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]"
            onClick={onClose}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
                className="w-full sm:max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-950/30 ring-1 ring-slate-900/5 p-4 pb-5 animate-panel-in"
            >
                <div className="flex items-center justify-between gap-3 px-1 pb-3">
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close the scanner"
                        className="w-10 h-10 -mr-1 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>

                {phase === 'error' ? (
                    <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-5 text-center">
                        <p className="text-amber-900 leading-relaxed">{error}</p>
                    </div>
                ) : (
                    <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-900">
                        <video
                            ref={videoRef}
                            className="absolute inset-0 w-full h-full object-cover"
                            playsInline
                            muted
                        />

                        {phase === 'starting' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
                                <Loader2 size={26} className="animate-spin" />
                                <span className="text-sm">Opening the camera…</span>
                            </div>
                        )}

                        {phase === 'scanning' && (
                            <>
                                {/* Viewfinder: dims everything outside the frame so
                                    it is obvious where to hold the label. */}
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    {/* Wide and shallow, matching the shape of a
                                        product barcode, and leaving the hint
                                        below it clear of the frame. */}
                                    <div className="relative w-[78%] aspect-[5/2] -mt-3 rounded-xl shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]">
                                        <Corner className="top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl" />
                                        <Corner className="top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl" />
                                        <Corner className="bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl" />
                                        <Corner className="bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl" />
                                        <div className="absolute inset-x-2 top-0 h-0.5 bg-blue-400 rounded-full shadow-[0_0_10px_2px_rgba(96,165,250,0.7)] animate-scan-sweep" />
                                    </div>
                                </div>

                                <p className="absolute bottom-3 left-3 right-3 text-center text-white text-sm font-medium bg-slate-950/55 backdrop-blur-sm px-3 py-2 rounded-xl">
                                    {hint}
                                </p>
                            </>
                        )}
                    </div>
                )}

                <div className="pt-4">
                    <Button variant="secondary" onClick={onClose} className="w-full">
                        {phase === 'error' ? 'Close' : 'Cancel'}
                    </Button>
                    {phase !== 'error' && (
                        <p className="mt-3 text-center text-sm text-slate-500 flex items-center justify-center gap-1.5">
                            <ScanLine size={15} className="shrink-0" />
                            Any barcode on the product will do
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

/** One bracket of the viewfinder frame. */
function Corner({ className }: { className: string }) {
    return <span className={`absolute w-7 h-7 border-white/95 ${className}`} />;
}
