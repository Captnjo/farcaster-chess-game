import { Suspense } from 'react';
import HomePageContent from './HomePageContent';

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}
