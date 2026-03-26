const BILLING_REFRESH_EVENT = 'billing-refresh-requested';

export function requestBillingRefresh(force = false) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(BILLING_REFRESH_EVENT, {
      detail: { force },
    })
  );
}

export function subscribeBillingRefresh(
  listener: (detail: { force: boolean }) => void
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleRefresh = (event: Event) => {
    const force =
      event instanceof CustomEvent && event.detail?.force === true;
    listener({ force });
  };

  window.addEventListener(BILLING_REFRESH_EVENT, handleRefresh);

  return () => {
    window.removeEventListener(BILLING_REFRESH_EVENT, handleRefresh);
  };
}
