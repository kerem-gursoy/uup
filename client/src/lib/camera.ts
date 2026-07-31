/**
 * Camera availability and failure messages, written for people who will not
 * know what a "secure context" or a "MediaStream" is.
 *
 * These are plain functions, not components, so they call t() directly rather than
 * through a hook - which is why t() reads the language when it runs instead of
 * closing over it.
 */
import { t } from '../i18n';

/**
 * Why the camera cannot be used, or null when it can be.
 *
 * The usual cause is not a broken camera but an insecure origin: browsers only
 * expose `getUserMedia` over HTTPS or on localhost, so opening the app from a
 * phone via a plain http:// LAN address removes the API entirely.
 */
export function cameraUnavailableReason(): string | null {
    if (typeof window === 'undefined') return null;

    if (!window.isSecureContext) {
        return t('camera.insecure', {
            origin: `${window.location.protocol}//${window.location.host}`,
        });
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        return t('camera.unsupported');
    }

    return null;
}

export function describeCameraError(err: unknown): string {
    const { name } = (err ?? {}) as { name?: string };

    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return t('camera.denied');
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return t('camera.notFound');
        case 'NotReadableError':
        case 'TrackStartError':
            return t('camera.inUse');
        case 'OverconstrainedError':
            return t('camera.constraints');
        default:
            return t('camera.failed');
    }
}

/**
 * Video constraints for barcode reading: the rear camera, at enough resolution
 * for the thin bars of an EAN-13 to survive compression.
 */
export const BARCODE_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
    video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
    },
    audio: false,
};
