/**
 * Which language the interface is in, and how numbers and dates are written.
 *
 * This module deliberately imports nothing. lib/format.ts and i18n/index.tsx both
 * depend on it, and keeping it a leaf is what stops those two forming a cycle.
 */

export type Lang = 'en' | 'tr';

export const LANGUAGES: readonly Lang[] = ['tr', 'en'];

/**
 * Written in their own language, always. Someone who has landed in a language they
 * cannot read still has to be able to recognise the way out, so these are never
 * translated and never become dictionary keys.
 */
export const LANGUAGE_NAMES: Record<Lang, string> = {
    tr: 'Türkçe',
    en: 'English',
};

const STORAGE_KEY = 'uup.lang';

/**
 * Number and date shapes per interface language. en-GB rather than en-US so English
 * keeps the day-first form the app has always shown ("3 Jun 2026", not "Jun 3, 2026").
 * The currency is not here: it is always lira, whichever language is on screen.
 */
export const LOCALE_TAGS: Record<Lang, string> = {
    tr: 'tr-TR',
    en: 'en-GB',
};

function isLang(value: unknown): value is Lang {
    return value === 'en' || value === 'tr';
}

function detect(): Lang {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (isLang(stored)) return stored;
    } catch {
        // Private mode, or a browser with storage switched off. Not knowing the
        // saved choice is not a reason to fail - fall through to the browser's own
        // language.
    }

    return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

/**
 * Resolved once, while this module is evaluated - which happens as main.tsx's
 * imports are pulled in, before React renders anything. That ordering is the whole
 * point: a price formatted during the very first paint is already in the right
 * language, so there is no flash of the wrong one.
 *
 * Do not move this into a hook or an effect. Both run after the first paint.
 */
let currentLang: Lang = detect();

const listeners = new Set<() => void>();

export function getLang(): Lang {
    return currentLang;
}

export function getLocaleTag(): string {
    return LOCALE_TAGS[currentLang];
}

/**
 * React subscribes through this rather than owning the language in state, so there
 * is exactly one source of truth. lib/format.ts is called from plain functions that
 * cannot use hooks, and it has to agree with what is on screen.
 */
export function subscribeToLang(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setLang(lang: Lang): void {
    if (lang === currentLang) return;
    currentLang = lang;

    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        // Not being able to remember the choice is no reason to refuse it.
    }

    document.documentElement.lang = lang;
    listeners.forEach((listener) => listener());
}

// index.html ships a static lang attribute - it is a file on a CDN and cannot know
// who is reading it. Correct it here, before the first paint.
document.documentElement.lang = currentLang;
