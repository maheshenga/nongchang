const ALIPAY_HOST_SUFFIXES = ['.alipay.com', '.alipaydev.com'];

function isAllowedAlipayUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.href);
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    ALIPAY_HOST_SUFFIXES.some((suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix))
  );
}

function hasActiveContent(root: ParentNode): boolean {
  if (root.querySelector('script, iframe, object, embed, link, style')) return true;
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (Array.from(el.attributes).some((attr) => attr.name.toLowerCase().startsWith('on'))) {
      return true;
    }
  }
  return false;
}

export function redirectToAlipayUrl(payUrl: string): void {
  if (!isAllowedAlipayUrl(payUrl)) throw new Error('Untrusted Alipay payment URL');
  window.location.href = payUrl;
}

export function submitAlipayForm(formHtml: string): void {
  const template = document.createElement('template');
  template.innerHTML = formHtml.trim();

  const sourceForms = template.content.querySelectorAll('form');
  if (sourceForms.length !== 1) throw new Error('Invalid Alipay form');

  const sourceForm = sourceForms[0] as HTMLFormElement;
  const action = sourceForm.getAttribute('action') ?? '';
  const method = (sourceForm.getAttribute('method') ?? 'post').toLowerCase();

  if (!isAllowedAlipayUrl(action)) throw new Error('Untrusted Alipay form action');
  if (method !== 'post') throw new Error('Invalid Alipay form method');
  if (hasActiveContent(sourceForm)) throw new Error('Invalid Alipay form content');

  const form = document.createElement('form');
  form.method = 'post';
  form.action = action;
  form.style.display = 'none';

  for (const input of Array.from(sourceForm.querySelectorAll('input'))) {
    const type = (input.getAttribute('type') ?? 'hidden').toLowerCase();
    const name = input.getAttribute('name');
    if (type !== 'hidden' || !name) continue;

    const safeInput = document.createElement('input');
    safeInput.type = 'hidden';
    safeInput.name = name;
    safeInput.value = input.getAttribute('value') ?? '';
    form.appendChild(safeInput);
  }

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 0);
}
