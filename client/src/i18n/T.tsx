import { Fragment, type ReactNode } from 'react';
import { raw, useLocale, type TranslationKey } from './index';

/**
 * A sentence with something rendered inside it - an amount in bold, a supplier's
 * name.
 *
 * English and Turkish put those pieces in different places ("You make X on each
 * one" / "Her birinden X kazanıyorsunuz"), so the sentence has to stay one
 * translatable string with a named hole in it. Splitting it into a prefix and a
 * suffix either side of the JSX would force the Turkish to keep English word order.
 *
 * Lives apart from the rest of i18n/ because this file exports a component and
 * nothing else, which is what React Fast Refresh needs to reload it.
 */
export function T({
    k,
    values,
}: {
    k: TranslationKey;
    values: Record<string, ReactNode>;
}) {
    useLocale();

    // A {name} with nothing to fill it is left as written, so a missed value is
    // loud on screen rather than a silently truncated sentence.
    return (
        <>
            {raw(k)
                .split(/(\{\w+\})/g)
                .map((part, index) => {
                    const match = /^\{(\w+)\}$/.exec(part);
                    if (!match) return part;
                    return <Fragment key={index}>{values[match[1]!]}</Fragment>;
                })}
        </>
    );
}
