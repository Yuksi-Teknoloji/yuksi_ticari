//src/app/dashboard/commercial/list-load/page.tsx
'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const ShippingListClient = dynamic(() => import('./ShippingListClient'), { ssr: false });

export default function CommercialLoadListPage() {
  return (
    <Suspense fallback={<div>Yükleniyor...</div>}>
      <ShippingListClient />
    </Suspense>
  );
}
