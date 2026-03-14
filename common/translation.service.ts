// common/translation/translation.service.ts
import { Global, Injectable, Module } from '@nestjs/common';
import { I18nService, I18nContext, TranslateOptions } from 'nestjs-i18n';
import type { I18nTranslations } from 'src/generated/i18n.generated'; // adjust path if needed

/** Helper type that produces dot-paths for nested object keys
 *  Example: { events: { user_not_found: string, nested: { a: string } } }
 *  produces: "events" | "events.user_not_found" | "events.nested" | "events.nested.a"
 */
export type TranslationKeys<T> = T extends object
    ? {
        [K in Extract<keyof T, string>]:
        T[K] extends object ? `${K}` | `${K}.${TranslationKeys<T[K]>}` : `${K}`;
    }[Extract<keyof T, string>]
    : never;

/** Concrete union of all valid keys from generated translations */
export type I18nKey = TranslationKeys<I18nTranslations>;

@Injectable()
export class TranslationService {
    constructor(private readonly i18n: I18nService<I18nTranslations>) { }

    /**
     * Type-safe translator.
     * - `key` must be one of the dot-path keys from I18nTranslations (I18nKey).
     * - `options` are forwarded to i18n.t; language is automatically taken
     *   from I18nContext.current()?.lang.
     */
    t<Key extends I18nKey>(key: Key, options?: TranslateOptions) {
        const lang = options?.lang ? options.lang : I18nContext.current()?.lang;
        // i18n.t typing may not accept our constructed Key type directly, so we cast to `any` for runtime call.
        return this.i18n.t(key as any, {
            lang,
            ...(options || {}),
        });
    }
}

@Global()
@Module({
    providers: [TranslationService],
    exports: [TranslationService],
})
export class TranslationModule { }