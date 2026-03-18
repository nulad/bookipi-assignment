import React, { useEffect, useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const SALE_STATUS_POLL_INTERVAL_MS = 5000;

const saleStatusMeta = {
  upcoming: {
    label: 'Upcoming',
    description: 'The sale window has not opened yet.',
  },
  active: {
    label: 'Active',
    description: 'Purchases are open while stock remains.',
  },
  sold_out: {
    label: 'Sold Out',
    description: 'The sale is still live, but every unit is already claimed.',
  },
  ended: {
    label: 'Ended',
    description: 'The sale window is closed.',
  },
};

const purchaseStatusMeta = {
  success: {
    title: 'Purchase confirmed',
    body: 'Your unit was reserved and persisted successfully.',
  },
  already_purchased: {
    title: 'Already purchased',
    body: 'This user already has a successful purchase for the active sale.',
  },
  sold_out: {
    title: 'Sold out',
    body: 'No stock remains for the current sale window.',
  },
  sale_not_started: {
    title: 'Sale not started',
    body: 'The purchase window has not opened yet.',
  },
  sale_ended: {
    title: 'Sale ended',
    body: 'The purchase window is already closed.',
  },
};

function toSentenceCase(value) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getApiUrl(pathname) {
  return `${API_BASE_URL}${pathname}`;
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(getApiUrl(pathname), {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message ?? 'Request failed.';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function SaleStatusCard({ saleSnapshot, isLoading, errorMessage, onRefresh }) {
  const currentMeta = saleStatusMeta[saleSnapshot.status] ?? {
    label: toSentenceCase(saleSnapshot.status),
    description: 'Sale state unavailable.',
  };

  return (
    <section className="panel sale-panel" aria-labelledby="sale-panel-heading">
      <div className="panel-heading">
        <div>
          <p className="panel-label">Live sale state</p>
          <h2 id="sale-panel-heading">Flash sale dashboard</h2>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="metrics-grid">
        <article className={`metric-card sale-status-${saleSnapshot.status}`}>
          <p className="metric-label">Sale status</p>
          <p className="metric-value">{currentMeta.label}</p>
          <p className="metric-description">{currentMeta.description}</p>
        </article>

        <article className="metric-card stock-card">
          <p className="metric-label">Remaining stock</p>
          <p className="metric-value">{saleSnapshot.remainingStock}</p>
          <p className="metric-description">
            Updated automatically every {SALE_STATUS_POLL_INTERVAL_MS / 1000} seconds.
          </p>
        </article>
      </div>

      <p className="helper-copy">
        Last updated{' '}
        <strong>{saleSnapshot.lastUpdatedAt ? formatTimestamp(saleSnapshot.lastUpdatedAt) : 'not yet loaded'}</strong>
      </p>

      {errorMessage ? <p className="message-banner error">{errorMessage}</p> : null}
    </section>
  );
}

function PurchaseResult({ purchaseResult }) {
  if (!purchaseResult) {
    return (
      <div className="result-card muted">
        <p className="result-title">No purchase submitted yet</p>
        <p className="result-body">
          Enter a user ID, then use Buy Now to run the flash sale flow.
        </p>
      </div>
    );
  }

  const meta = purchaseStatusMeta[purchaseResult.status] ?? {
    title: toSentenceCase(purchaseResult.status),
    body: 'The API returned a purchase result.',
  };

  return (
    <div className={`result-card ${purchaseResult.status}`}>
      <p className="result-title">{meta.title}</p>
      <p className="result-body">{meta.body}</p>
      <p className="result-code">API status: {purchaseResult.status}</p>
      {purchaseResult.purchase ? (
        <dl className="details-list">
          <div>
            <dt>User ID</dt>
            <dd>{purchaseResult.purchase.userId}</dd>
          </div>
          <div>
            <dt>Purchase ID</dt>
            <dd>{purchaseResult.purchase.id}</dd>
          </div>
          <div>
            <dt>Purchased at</dt>
            <dd>{formatTimestamp(purchaseResult.purchase.purchasedAt)}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function LookupResult({ lookupResult }) {
  if (!lookupResult) {
    return (
      <div className="result-card muted">
        <p className="result-title">No status lookup yet</p>
        <p className="result-body">
          Use Check Purchase Status to verify whether a user already owns a successful purchase.
        </p>
      </div>
    );
  }

  return (
    <div className={`result-card ${lookupResult.hasPurchased ? 'success' : 'neutral'}`}>
      <p className="result-title">
        {lookupResult.hasPurchased ? 'Purchase found' : 'No purchase found'}
      </p>
      <p className="result-body">
        {lookupResult.userId} {lookupResult.hasPurchased ? 'has' : 'has not'} completed a successful purchase.
      </p>
    </div>
  );
}

export default function App() {
  const saleStatusAbortControllerRef = useRef(null);
  const saleStatusRequestIdRef = useRef(0);

  const [saleSnapshot, setSaleSnapshot] = useState({
    status: 'upcoming',
    remainingStock: '--',
    lastUpdatedAt: null,
  });
  const [saleStatusError, setSaleStatusError] = useState('');
  const [isSaleStatusLoading, setIsSaleStatusLoading] = useState(true);

  const [purchaseUserId, setPurchaseUserId] = useState('');
  const [purchaseResult, setPurchaseResult] = useState(null);
  const [purchaseError, setPurchaseError] = useState('');
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  const [lookupUserId, setLookupUserId] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [isCheckingPurchase, setIsCheckingPurchase] = useState(false);

  async function loadSaleStatus() {
    const requestId = saleStatusRequestIdRef.current + 1;
    saleStatusRequestIdRef.current = requestId;

    saleStatusAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    saleStatusAbortControllerRef.current = abortController;

    setIsSaleStatusLoading(true);
    setSaleStatusError('');

    try {
      const payload = await requestJson('/sale-status', {
        signal: abortController.signal,
      });

      if (saleStatusRequestIdRef.current !== requestId) {
        return;
      }

      setSaleSnapshot({
        status: payload.status,
        remainingStock: payload.remainingStock,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (saleStatusRequestIdRef.current !== requestId) {
        return;
      }

      setSaleStatusError(error.message);
    } finally {
      if (saleStatusRequestIdRef.current === requestId) {
        setIsSaleStatusLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadSaleStatus();

    const intervalId = window.setInterval(() => {
      void loadSaleStatus();
    }, SALE_STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      saleStatusAbortControllerRef.current?.abort();
    };
  }, []);

  async function handlePurchaseSubmit(event) {
    event.preventDefault();
    const normalizedPurchaseUserId = purchaseUserId.trim();

    if (!normalizedPurchaseUserId) {
      setPurchaseResult(null);
      setPurchaseError('userId must be a non-empty string');
      return;
    }

    setIsSubmittingPurchase(true);
    setPurchaseError('');

    try {
      const payload = await requestJson('/purchase', {
        method: 'POST',
        body: JSON.stringify({
          userId: purchaseUserId,
        }),
      });

      setPurchaseResult(payload);

      if (payload.purchase?.userId) {
        setLookupUserId(payload.purchase.userId);
      } else {
        setLookupUserId(normalizedPurchaseUserId);
      }

      await loadSaleStatus();
    } catch (error) {
      setPurchaseResult(null);
      setPurchaseError(error.message);
    } finally {
      setIsSubmittingPurchase(false);
    }
  }

  async function handleLookupSubmit(event) {
    event.preventDefault();
    const normalizedLookupUserId = lookupUserId.trim();

    if (!normalizedLookupUserId) {
      setLookupResult(null);
      setLookupError('userId must be a non-empty string');
      return;
    }

    const encodedUserId = encodeURIComponent(normalizedLookupUserId);

    setIsCheckingPurchase(true);
    setLookupError('');

    try {
      const payload = await requestJson(`/purchase-status/${encodedUserId}`);
      setLookupResult(payload);
    } catch (error) {
      setLookupResult(null);
      setLookupError(error.message);
    } finally {
      setIsCheckingPurchase(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Bookipi Assignment</p>
        <h1>Single-page flash sale demo</h1>
        <p className="summary">
          This page exercises the full assignment flow from the browser: live sale state,
          purchase submission, result feedback, and purchase-status verification.
        </p>
        <div className="status-row" aria-label="Assignment coverage">
          <span className="status-pill">Sale status</span>
          <span className="status-pill">Stock tracking</span>
          <span className="status-pill">Buy Now flow</span>
          <span className="status-pill">Purchase lookup</span>
        </div>
      </section>

      <SaleStatusCard
        saleSnapshot={saleSnapshot}
        isLoading={isSaleStatusLoading}
        errorMessage={saleStatusError}
        onRefresh={() => {
          void loadSaleStatus();
        }}
      />

      <section className="panel action-panel" aria-labelledby="purchase-heading">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Buy flow</p>
            <h2 id="purchase-heading">Submit a purchase</h2>
          </div>
        </div>

        <form className="stack" onSubmit={handlePurchaseSubmit}>
          <label className="field">
            <span>User ID</span>
            <input
              name="purchaseUserId"
              type="text"
              placeholder="alice@example.com"
              value={purchaseUserId}
              onChange={(event) => {
                setPurchaseUserId(event.target.value);
              }}
            />
          </label>

          <button className="primary-button" type="submit" disabled={isSubmittingPurchase}>
            {isSubmittingPurchase ? 'Submitting...' : 'Buy Now'}
          </button>
        </form>

        {purchaseError ? <p className="message-banner error">{purchaseError}</p> : null}
        <PurchaseResult purchaseResult={purchaseResult} />
      </section>

      <section className="panel action-panel" aria-labelledby="lookup-heading">
        <div className="panel-heading">
          <div>
            <p className="panel-label">Verification</p>
            <h2 id="lookup-heading">Check purchase status</h2>
          </div>
        </div>

        <form className="stack" onSubmit={handleLookupSubmit}>
          <label className="field">
            <span>User ID</span>
            <input
              name="lookupUserId"
              type="text"
              placeholder="winner@example.com"
              value={lookupUserId}
              onChange={(event) => {
                setLookupUserId(event.target.value);
              }}
            />
          </label>

          <button className="secondary-button" type="submit" disabled={isCheckingPurchase}>
            {isCheckingPurchase ? 'Checking...' : 'Check Purchase Status'}
          </button>
        </form>

        {lookupError ? <p className="message-banner error">{lookupError}</p> : null}
        <LookupResult lookupResult={lookupResult} />
      </section>
    </main>
  );
}
