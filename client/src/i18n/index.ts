import { useMemo, useSyncExternalStore } from 'react';
import { getLang, getLocaleTag, LOCALE_TAGS, subscribeToLang, type Lang } from './locale';
import { en, type Dictionary, type TranslationKey } from './en';
import { tr } from './tr';

/**
 * Looking up copy, and nothing else. Formatting numbers, money and dates lives in
 * lib/format.ts; both read the same language from ./locale.
 */

const DICTIONARIES: Record<Lang, Dictionary> = { en, tr };

function dictionary(): Dictionary {
    return DICTIONARIES[getLang()];
}

/** Pulls the {names} out of a copy string at type level, so t() can demand them. */
type Placeholders<S extends string> = S extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never;

/**
 * Copy with no placeholders means t() takes one argument; copy with placeholders
 * means t() requires an object holding exactly those names. So renaming {amount} in
 * en.ts breaks every call site that fills it, which is the point of doing this in
 * the type system rather than hoping.
 *
 * The [x] extends [never] wrapper stops the conditional distributing over the union
 * of placeholder names - without it every key would come out argument-less.
 */
type Args<K extends TranslationKey> = [Placeholders<(typeof en)[K]>] extends [never]
    ? []
    : [values: Record<Placeholders<(typeof en)[K]>, string | number>];

function interpolate(template: string, values?: Record<string, string | number>): string {
    if (!values) return template;

    // An unmatched {name} is left as written: visible in the one manual pass, rather
    // than silently disappearing from the sentence.
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole
    );
}

function translateIn(
    lang: Lang,
    key: TranslationKey,
    values?: Record<string, string | number>
): string {
    return interpolate(DICTIONARIES[lang][key] ?? en[key], values);
}

/**
 * Reads the language when it is called rather than closing over it, so this same
 * imported function is correct from a component, from a module-level table, and
 * from a plain helper like lib/camera.ts that has no access to hooks.
 *
 * Re-rendering is a separate concern, handled by useT/useLocale below.
 */
export function t<K extends TranslationKey>(key: K, ...args: Args<K>): string {
    const values = args[0] as Record<string, string | number> | undefined;
    return translateIn(getLang(), key, values);
}

/** The template as written, placeholders intact - for <T>, which fills them with
 *  React elements rather than strings. */
export function raw(key: TranslationKey): string {
    return dictionary()[key] ?? en[key];
}

/** Keys ending _other, with the suffix stripped: the bases tPlural will accept. */
type PluralBase = {
    [K in TranslationKey]: K extends `${infer Base}_other` ? Base : never;
}[TranslationKey];

const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * English distinguishes "1 product" from "2 products"; Turkish does not inflect at
 * all after a numeral - "3 ürün", never "3 ürünler". Intl.PluralRules already knows
 * which categories each language has, so neither language needs a ternary written
 * out by hand at the call site.
 */
function pluralIn(
    lang: Lang,
    base: PluralBase,
    count: number,
    values?: Record<string, string | number>
): string {
    const tag = LOCALE_TAGS[lang];

    let rules = pluralRules.get(tag);
    if (!rules) {
        rules = new Intl.PluralRules(tag);
        pluralRules.set(tag, rules);
    }

    const dict = DICTIONARIES[lang];
    const preferred = `${base}_${rules.select(count)}`;
    // Every base is guaranteed an _other form by PluralBase; the rest are optional.
    const key = (preferred in dict ? preferred : `${base}_other`) as TranslationKey;

    return interpolate(dict[key] ?? en[key], { count, ...values });
}

export function tPlural(
    base: PluralBase,
    count: number,
    values?: Record<string, string | number>
): string {
    return pluralIn(getLang(), base, count, values);
}

/**
 * The key a count would select, for the case where the sentence has to be built
 * from React elements rather than a string - a bold figure inside a pluralised
 * sentence, say. Lets <T> stay plural-aware without a hand-written ternary.
 */
export function pluralKey(base: PluralBase, count: number): TranslationKey {
    const tag = getLocaleTag();

    let rules = pluralRules.get(tag);
    if (!rules) {
        rules = new Intl.PluralRules(tag);
        pluralRules.set(tag, rules);
    }

    const candidate = `${base}_${rules.select(count)}`;
    return (candidate in en ? candidate : `${base}_other`) as TranslationKey;
}

/**
 * Subscribing to the language, for a component that shows copy.
 *
 * The returned function is bound to the language this render saw, and gets a fresh
 * identity whenever that changes. That matters more than it looks: a component that
 * lists `t` in a useMemo or useCallback dependency array would otherwise hold the
 * previous language's copy forever, because the module-level `t` never changes
 * identity. PriceChart builds its series labels inside a useMemo and would have
 * done exactly that.
 */
export function useT(): typeof t {
    const lang = useSyncExternalStore(subscribeToLang, getLang, getLang);

    return useMemo(
        () =>
            (<K extends TranslationKey>(key: K, ...args: Args<K>) =>
                translateIn(
                    lang,
                    key,
                    args[0] as Record<string, string | number> | undefined
                )) as typeof t,
        [lang]
    );
}

/** tPlural's counterpart to useT, with the same fresh-identity-per-language rule. */
export function useTPlural(): typeof tPlural {
    const lang = useSyncExternalStore(subscribeToLang, getLang, getLang);

    return useMemo(
        () =>
            ((base, count, values) =>
                pluralIn(lang, base, count, values)) as typeof tPlural,
        [lang]
    );
}

/**
 * For components that format money or dates but have no copy of their own. They read
 * the language indirectly through lib/format, which React cannot see, so without
 * this they would keep rendering the previous language's numbers after a switch.
 */
export function useLocale(): Lang {
    return useSyncExternalStore(subscribeToLang, getLang, getLang);
}

/** True when a key exists - for looking up codes that come from outside the app. */
export function hasKey(key: string): key is TranslationKey {
    return key in en;
}

/**
 * index.html is a static file served from the CDN, so its <title> and lang cannot
 * know who is reading. Called from main.tsx before the first render.
 */
export function applyDocumentLanguage(): void {
    document.documentElement.lang = getLang();
    document.title = t('app.title');
}

export type { TranslationKey };
export type { Lang };
