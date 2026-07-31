/**
 * Camera availability and failure messages, written for people who will not
 * know what a "secure context" or a "MediaStream" is.
 */

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
        return `The camera only works over a secure connection. This page was opened as ${window.location.protocol}//${window.location.host}, so the browser blocks camera access. Use https, or open the app on this computer at localhost.`;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        return 'This browser cannot use the camera. You can still type the barcode instead.';
    }

    return null;
}

export function describeCameraError(err: unknown): string {
    const { name } = (err ?? {}) as { name?: string };

    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return 'Camera permission was refused. Allow camera access for this site in your browser settings, then try again.';
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return 'No camera was found on this device.';
        case 'NotReadableError':
        case 'TrackStartError':
            return 'The camera is already being used by another app. Close it and try again.';
        case 'OverconstrainedError':
            return 'This camera does not support the requested video settings.';
        default:
            return 'The camera could not be started. You can still type the barcode instead.';
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
