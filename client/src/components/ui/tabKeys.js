// Automatic activation for the existing, immediately rendered filter tabs.
export function tabKeys(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
  const index = tabs.indexOf(document.activeElement); if (index < 0) return;
  event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus(); tabs[next]?.click();
}
