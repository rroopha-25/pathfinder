// Open the side panel when the toolbar icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { events = [] } = await chrome.storage.local.get('events');
  events.push({ name: 'extension_installed', props: { reason }, ts: Date.now() });
  await chrome.storage.local.set({ events: events.slice(-500) });
});
