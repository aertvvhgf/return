/** Opens the chat tab and selects a thread without threading props through every screen. */
export function openChatThread(threadId: string) {
  window.location.hash = "#chat";
  window.dispatchEvent(new CustomEvent<string>("return:open-chat", { detail: threadId }));
}
