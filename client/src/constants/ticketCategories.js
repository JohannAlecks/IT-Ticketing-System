// One shared source of truth for category values and requester guidance.
export const ticketCategories = [
  { value: 'INTERNET_NETWORK', label: 'Internet / Network', suggestions: ['No internet connection', 'Wi-Fi keeps disconnecting', 'Unable to connect to the office network'], guidance: ['What location and users are affected?', 'Is the connection Wi-Fi, LAN, or both?', 'What error did you see, and when did it begin?'] },
  { value: 'VPN', label: 'VPN', suggestions: ['Unable to connect to VPN', 'VPN disconnects frequently', 'VPN connected but internal resources are unavailable'], guidance: ['Which device and VPN client are you using?', 'What error or connection behavior do you see?', 'Does regular internet access still work, and when did this start?'], credentialWarning: true },
  { value: 'PC_LAPTOP', label: 'PC / Laptop', suggestions: ['Computer will not turn on', 'Laptop is running slowly', 'Computer is freezing or restarting'], guidance: ['Which device is affected?', 'What symptoms or errors are present?', 'What troubleshooting have you tried, and how is work affected?'] },
  { value: 'PRINTER_SCANNER', label: 'Printer / Scanner', suggestions: ['Printer is offline', 'Unable to print documents', 'Scanner is not detecting documents'], guidance: ['Which printer or scanner and location are affected?', 'What error appears?', 'What action have you tried, and how many users are affected?'] },
  { value: 'ACCOUNTS_ACCESS', label: 'Accounts / Access', suggestions: ['Request access to an application', 'Account is locked', 'Unable to access a shared folder'], guidance: ['Which account or application is involved?', 'What access do you need?', 'What error appears, and when did it begin?'], credentialWarning: true },
  { value: 'EMAIL', label: 'Email', suggestions: ['Unable to send emails', 'Unable to receive emails', 'Email application is not opening'], guidance: ['Which email application are you using?', 'Is sending, receiving, or both affected?', 'What error appears, who is affected, and when did it begin?'], credentialWarning: true },
  { value: 'SOFTWARE_APPLICATION', label: 'Software / Application', suggestions: ['Application will not open', 'Application error message', 'Request software installation'], guidance: ['Which application and version are affected?', 'What action triggers the problem?', 'What error appears, and when did it begin?'] },
  { value: 'SERVER_SYSTEM', label: 'Server / System', suggestions: ['Internal system is unavailable', 'Shared server cannot be accessed', 'System is running slowly'], guidance: ['Which system or server is affected?', 'How many users are affected?', 'What error, availability issue, or slowness is occurring, and when did it start?'] },
  { value: 'REQUESTS', label: 'Requests', suggestions: ['Request a new computer or laptop', 'Request software installation', 'Request access for a new team member'], guidance: ['What item or access is requested?', 'Why is it needed and who will use it?', 'What date is required, and is approval available?'] },
  { value: 'SECURITY', label: 'Security', suggestions: ['Suspicious email or phishing attempt', 'Possible malware infection', 'Lost or stolen device'], guidance: ['What activity did you observe and at what time?', 'Which device or account is involved?', 'Were there links or attachments, and is the device connected to the network?'], credentialWarning: true },
  { value: 'OTHERS', label: 'Others', suggestions: ['Other technical issue', 'Other equipment request', 'Need help with a workplace technology issue'], guidance: ['Which service or device is affected?', 'What did you expect to happen?', 'What happened instead, what error appeared, and when did it start?'] },
];

export const categoryOptions = ticketCategories.map(({ value, label }) => ({ value, label }));

export function categoryConfig(value) {
  return ticketCategories.find((category) => category.value === value)
    || ticketCategories.find((category) => category.value === 'OTHERS');
}

export function categoryLabel(value) { return categoryConfig(value).label; }
export function categorySuggestions(value) { return categoryConfig(value).suggestions; }
export function categoryDescriptionGuidance(value) { return categoryConfig(value).guidance; }
export function hasCredentialWarning(value) { return Boolean(categoryConfig(value).credentialWarning); }
