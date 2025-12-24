// src/app/dashboard/commercial/profile/page.tsx
'use client';

import * as React from 'react';
import Image from 'next/image';

/* -------- helpers (token) -------- */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const keys = ['auth_token', 'token', 'authToken', 'access_token', 'jwt', 'auth'];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v && v.trim()) return v.replace(/^Bearer\s+/i, '').trim();
    }
  } catch {}
  if (typeof document !== 'undefined') {
    const m =
      document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/) ||
      document.cookie.match(/(?:^|;\s*)token=([^;]+)/) ||
      document.cookie.match(/(?:^|;\s*)authToken=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

async function readJson(res: Response): Promise<any> {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

const pickMsg = (d: any, fb: string) =>
  d?.error?.message || d?.message || d?.detail || d?.title || (typeof d === 'string' ? d : fb);

/* -------- API types (swagger response'a göre) -------- */
type CompanyProfile = {
  id?: string;
  companyTrackingNo?: string;
  companyName?: string;
  companyPhone?: string;
  cityId?: number;
  stateId?: number;
  specialCommissionRate?: number | string | null;
  assignedKilometers?: number | null;
  consumedKilometers?: number | null;
  canReceivePayments?: boolean | null;
  isVisible?: boolean | null;
  remainingKilometers?: number | null;
  status?: string | null;
};

type ManagerProfile = {
  id?: string;
  nameSurname: string;
  email?: string | null;
  phone?: string | null;
};

type DealerProfile = {
  id?: string;
  name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ManagerProfileResponse = {
  success?: boolean;
  message?: string | null;
  data?: {
    company?: CompanyProfile;
    manager?: ManagerProfile;
    dealer?: DealerProfile; // ✅ eklendi
  };
};

/* ---- geo lookup types ---- */
type GeoState = { id: number; name: string };
type GeoCity = { id: number; name: string };

/* -------- page -------- */
export default function CommercialProfilePage() {
  const [token, setToken] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const [company, setCompany] = React.useState<CompanyProfile | null>(null);
  const [dealer, setDealer] = React.useState<DealerProfile | null>(null); // ✅ eklendi

  // ✅ resolved names
  const [stateName, setStateName] = React.useState<string>('');
  const [cityName, setCityName] = React.useState<string>('');

  const [form, setForm] = React.useState({
    nameSurname: '',
    email: '',
    phone: '',
    password: '',
  });

  const [editing, setEditing] = React.useState({
    nameSurname: false,
    email: false,
    phone: false,
    password: false,
  });

  const toggle = (k: keyof typeof editing) => setEditing((s) => ({ ...s, [k]: !s[k] }));

  const headers = React.useMemo<HeadersInit>(() => {
    const h: HeadersInit = { Accept: 'application/json' };
    if (token) (h as any).Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  /* 1) token çek */
  React.useEffect(() => {
    setToken(getAuthToken());
  }, []);

  /* 2) profil yükle (GET /api/admin/companies/manager/profile) */
  React.useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const res = await fetch('/yuksi/admin/companies/manager/profile', {
          cache: 'no-store',
          headers,
        });

        const j: ManagerProfileResponse = await readJson(res);
        if (!res.ok || j?.success === false) {
          throw new Error(pickMsg(j, `HTTP ${res.status}`));
        }

        const data = j?.data ?? {};
        const mgr = data.manager ?? ({} as ManagerProfile);
        const comp = data.company ?? null;
        const dlr = data.dealer ?? null;

        if (!alive) return;

        setCompany(comp);
        setDealer(dlr); // ✅ eklendi
        setForm({
          nameSurname: mgr?.nameSurname ?? '',
          email: mgr?.email ?? '',
          phone: mgr?.phone ?? '',
          password: '',
        });
      } catch (e: any) {
        if (!alive) return;
        setErrMsg(e?.message || 'Profil bilgileri alınamadı.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, headers]);

  /* ✅ 2.1) stateId/cityId -> name resolve
     IMPORTANT: geo endpointleri de rewrite üzerinden gitmeli => /yuksi/geo/...
  */
  React.useEffect(() => {
    if (!company?.stateId) {
      setStateName('');
      setCityName('');
      return;
    }

    let alive = true;

    (async () => {
      try {
        // 1) state listesi (country_id=225)
        const resStates = await fetch(`/yuksi/geo/states?country_id=225&limit=500&offset=0`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        const states: GeoState[] = await readJson(resStates);
        if (!resStates.ok) throw new Error(`States HTTP ${resStates.status}`);

        const st = Array.isArray(states)
          ? states.find((x) => Number(x.id) === Number(company.stateId))
          : null;

        if (!alive) return;
        setStateName(st?.name ?? '');

        // 2) city listesi (state_id ile)
        if (!company?.cityId) {
          setCityName('');
          return;
        }

        const resCities = await fetch(
          `/yuksi/geo/cities?state_id=${encodeURIComponent(String(company.stateId))}&limit=1000&offset=0`,
          {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          },
        );

        const cities: GeoCity[] = await readJson(resCities);
        if (!resCities.ok) throw new Error(`Cities HTTP ${resCities.status}`);

        const ct = Array.isArray(cities)
          ? cities.find((x) => Number(x.id) === Number(company.cityId))
          : null;

        if (!alive) return;
        setCityName(ct?.name ?? '');
      } catch {
        if (!alive) return;
        setStateName('');
        setCityName('');
      }
    })();

    return () => {
      alive = false;
    };
  }, [company?.stateId, company?.cityId]);

  const onChange =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  /* 3) Kaydet (PUT /api/admin/companies/manager/profile) */
  async function saveAll() {
    if (!token || saving) return;
    setSaving(true);
    setOkMsg(null);
    setErrMsg(null);

    try {
      const body: any = {
        nameSurname: form.nameSurname.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      };

      // password opsiyonel: doluysa gönder
      if (form.password.trim()) body.password = form.password;

      const res = await fetch('/yuksi/admin/companies/manager/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });

      const j: any = await readJson(res);
      if (!res.ok || j?.success === false) {
        throw new Error(pickMsg(j, `HTTP ${res.status}`));
      }

      setOkMsg(j?.message || 'Profil başarıyla güncellendi.');
      setEditing({ nameSurname: false, email: false, phone: false, password: false });
      setForm((p) => ({ ...p, password: '' }));

      // günceli tekrar çekelim (backend normalize ediyorsa)
      try {
        const r2 = await fetch('/yuksi/admin/companies/manager/profile', {
          cache: 'no-store',
          headers,
        });
        const j2: ManagerProfileResponse = await readJson(r2);
        if (r2.ok && j2?.success !== false) {
          const mgr = j2?.data?.manager;
          const comp = j2?.data?.company ?? null;
          const dlr = j2?.data?.dealer ?? null;

          setCompany(comp);
          setDealer(dlr); // ✅ eklendi
          setForm((prev) => ({
            ...prev,
            nameSurname: mgr?.nameSurname ?? prev.nameSurname,
            email: mgr?.email ?? prev.email,
            phone: mgr?.phone ?? prev.phone,
            password: '',
          }));
        }
      } catch {}
    } catch (e: any) {
      setErrMsg(e?.message || 'Profil güncellenemedi.');
    } finally {
      setSaving(false);
    }
  }

  const dealerFullName = React.useMemo(() => {
    const n = (dealer?.name ?? '').trim();
    const s = (dealer?.surname ?? '').trim();
    const full = `${n} ${s}`.trim();
    return full || '';
  }, [dealer?.name, dealer?.surname]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ticari Profil</h1>

      {loading && <div className="rounded-xl border border-neutral-200 bg-white p-4">Yükleniyor…</div>}

      {!loading && (
        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-neutral-200/70 bg-orange-50 p-4 sm:p-6">
            {okMsg && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
                {okMsg}
              </div>
            )}
            {errMsg && (
              <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
                {errMsg}
              </div>
            )}

            <Block title="Yönetici Bilgileri (güncellenebilir)">
              <Row>
                <input
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none disabled:bg-white"
                  placeholder="Ad Soyad"
                  value={form.nameSurname}
                  onChange={onChange('nameSurname')}
                  disabled={!editing.nameSurname}
                />
                <EditButton onClick={() => toggle('nameSurname')} active={editing.nameSurname} />
              </Row>

              <Row>
                <input
                  type="email"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none disabled:bg-white"
                  placeholder="E-posta"
                  value={form.email}
                  onChange={onChange('email')}
                  disabled={!editing.email}
                />
                <EditButton onClick={() => toggle('email')} active={editing.email} />
              </Row>

              <Row>
                <input
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none disabled:bg-white"
                  placeholder="Telefon"
                  value={form.phone}
                  onChange={onChange('phone')}
                  disabled={!editing.phone}
                />
                <EditButton onClick={() => toggle('phone')} active={editing.phone} />
              </Row>

              <Row>
                <input
                  type="password"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none disabled:bg-white"
                  placeholder="Yeni Şifre (opsiyonel)"
                  value={form.password}
                  onChange={onChange('password')}
                  disabled={!editing.password}
                />
                <EditButton onClick={() => toggle('password')} active={editing.password} />
              </Row>

              <p className="text-xs text-neutral-600">Not: Şifre alanı boşsa backend’e gönderilmez.</p>
            </Block>

            <Block title="Şirket Bilgileri (sadece görüntüleme)">
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-800 space-y-1">
                <InfoLine label="Şirket Adı" value={company?.companyName} />
                <InfoLine label="Tracking No" value={company?.companyTrackingNo} />
                <InfoLine label="Telefon" value={company?.companyPhone} />

                {/* ✅ ID yerine name (fallback: id) */}
                <InfoLine
                  label="State"
                  value={
                    stateName?.trim() ? stateName : company?.stateId != null ? String(company.stateId) : undefined
                  }
                />
                <InfoLine
                  label="City"
                  value={cityName?.trim() ? cityName : company?.cityId != null ? String(company.cityId) : undefined}
                />

                <InfoLine
                  label="Özel Komisyon"
                  value={company?.specialCommissionRate != null ? String(company.specialCommissionRate) : undefined}
                />
                <InfoLine
                  label="KM (Atanan / Kullanılan / Kalan)"
                  value={[
                    company?.assignedKilometers != null ? String(company.assignedKilometers) : '-',
                    company?.consumedKilometers != null ? String(company.consumedKilometers) : '-',
                    company?.remainingKilometers != null ? String(company.remainingKilometers) : '-',
                  ].join(' / ')}
                />
                <InfoLine
                  label="Ödeme Alabilir"
                  value={company?.canReceivePayments != null ? (company.canReceivePayments ? 'evet' : 'hayır') : undefined}
                />
                <InfoLine
                  label="Görünür"
                  value={company?.isVisible != null ? (company.isVisible ? 'evet' : 'hayır') : undefined}
                />
                <InfoLine label="Durum" value={company?.status ?? undefined} />
              </div>
            </Block>

            {/* ✅ yeni blok: bağlı olduğu bayi */}
            <Block title="Bağlı Olduğu Bayi (sadece görüntüleme)">
              <div className="rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-800 space-y-1">
                <InfoLine label="Bayi" value={dealerFullName || undefined} />
                <InfoLine label="E-posta" value={dealer?.email ?? undefined} />
                <InfoLine label="Telefon" value={dealer?.phone ?? undefined} />
              </div>
            </Block>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={saveAll}
                disabled={saving || !token}
                className="rounded-xl border border-orange-300 bg-white px-6 py-2.5 text-sm font-semibold text-orange-600 shadow-sm hover:bg-orange-50 disabled:opacity-60"
              >
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>

          <aside className="rounded-2xl border border-neutral-200/70 bg-white p-6">
            <div className="flex flex-col items-center text-center">
              <div className="relative h-40 w-40">
                <Image
                  src="/Brand/yuksi.png"
                  alt="profile"
                  fill
                  className="rounded-full object-cover ring-4 ring-orange-500"
                />
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-orange-600">Yönetici:</span> {form.nameSurname || '—'}
                </p>
                <p>
                  <span className="font-semibold text-orange-600">E-posta:</span> {form.email || '—'}
                </p>
                <p>
                  <span className="font-semibold text-orange-600">Telefon:</span> {form.phone || '—'}
                </p>

                <div className="pt-2 border-t">
                  <p className="mt-2">
                    <span className="font-semibold text-orange-600">Şirket:</span> {company?.companyName || '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-orange-600">Tracking:</span> {company?.companyTrackingNo || '—'}
                  </p>
                  <p>
                    <span className="font-semibold text-orange-600">Konum:</span>{' '}
                    {(stateName?.trim() ? stateName : company?.stateId != null ? String(company.stateId) : '—') +
                      ' / ' +
                      (cityName?.trim() ? cityName : company?.cityId != null ? String(company.cityId) : '—')}
                  </p>

                  {/* ✅ aside'a da kısa bayi özeti */}
                  <div className="pt-2 mt-2 border-t">
                    <p className="mt-2">
                      <span className="font-semibold text-orange-600">Bağlı Bayi:</span>{' '}
                      {dealerFullName || '—'}
                    </p>
                    <p>
                      <span className="font-semibold text-orange-600">Bayi Tel:</span>{' '}
                      {dealer?.phone || '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

/* ---- küçük yardımcılar ---- */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-sm font-semibold text-neutral-800">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[1fr_auto] items-center gap-3">{children}</div>;
}

function EditButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
        active ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-emerald-500 hover:bg-emerald-600'
      }`}
    >
      DÜZENLE
    </button>
  );
}

function InfoLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-600">{label}</span>
      <span className="font-semibold text-neutral-900">{value && value.trim() ? value : '—'}</span>
    </div>
  );
}
