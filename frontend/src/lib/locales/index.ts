import { EN_MESSAGES, type MessageKey } from "./en";
import { ZH_MESSAGES } from "./zh-CN";

export { EN_MESSAGES, type MessageKey } from "./en";
export { ZH_MESSAGES } from "./zh-CN";

export type Locale = "en" | "zh-CN";
export const SUPPORTED_LOCALES: Locale[] = ["en", "zh-CN"];

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = {
  en: EN_MESSAGES,
  "zh-CN": ZH_MESSAGES,
};
