// Organization profile + universal settings shared by the whole app (one organization per database).
// Loads after sign-in; sets branding for exports; provides the base currency and setup state.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import * as org from '../services/org';
import type { Organization } from '../services/org';
import { setBranding } from '../lib/branding';

interface OrgContextType {
  organization: Organization | null;
  loading: boolean;
  error: string | null;
  baseCurrency: string;
  logoUrl: string | null;
  setupComplete: boolean;
  reload: () => Promise<Organization | null>;
  setOrganization: (o: Organization) => void;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export const OrgProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [organization, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const o = await org.fetchOrganization();
      setOrg(o);
      return o;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  // logo: short-lived signed URL, refreshed when the path changes
  useEffect(() => {
    let alive = true;
    const path = organization?.logoPath;
    if (!path) { setLogoUrl(null); return; }
    org.orgLogoSignedUrl(path).then(u => { if (alive) setLogoUrl(u); }).catch(() => { if (alive) setLogoUrl(null); });
    return () => { alive = false; };
  }, [organization?.logoPath]);

  useEffect(() => {
    setBranding({ name: organization?.tradeName || organization?.legalName, logoUrl });
  }, [organization?.tradeName, organization?.legalName, logoUrl]);

  const value = useMemo<OrgContextType>(() => ({
    organization,
    loading,
    error,
    baseCurrency: organization?.baseCurrency ?? 'OMR',
    logoUrl,
    setupComplete: organization?.setupStatus === 'completed',
    reload,
    setOrganization: setOrg,
  }), [organization, loading, error, logoUrl, reload]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};

export const useOrg = () => {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within an OrgProvider');
  return ctx;
};
export const useOptionalOrg = () => useContext(OrgContext);
