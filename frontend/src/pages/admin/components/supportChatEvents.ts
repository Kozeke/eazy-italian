/**
 * supportChatEvents.ts
 * Decouples AdminHeader help-menu actions from SupportChatWidget open state.
 */

// Custom event name used to request opening the floating support chat panel
export const SUPPORT_CHAT_OPEN_EVENT = "eazy-italian:support-chat-open";

// Dispatches a global event that SupportChatWidget listens for to open the panel
export function openSupportChatWidget(): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_CHAT_OPEN_EVENT));
}
