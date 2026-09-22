import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LanguageProvider } from '@/context/LanguageContext';
import { QUEUE } from '@/data/mock';
import { CallerLayout } from '@/features/caller/CallerLayout';
import { CallEndedScreen } from '@/features/caller/screens/CallEndedScreen';
import { InCallScreen } from '@/features/caller/screens/InCallScreen';
import { ReadyScreen } from '@/features/caller/screens/ReadyScreen';
import { CaseReviewScreen } from '@/features/specialist/CaseReviewScreen';
import { SpecialistLayout } from '@/features/specialist/SpecialistLayout';
import { ROUTES } from './routes';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.callerReady} replace /> },
      {
        path: ROUTES.caller,
        element: <CallerLayout />,
        children: [
          { index: true, element: <Navigate to={ROUTES.callerReady} replace /> },
          { path: 'ready', element: <ReadyScreen /> },
          { path: 'call', element: <InCallScreen /> },
          { path: 'ended', element: <CallEndedScreen /> },
        ],
      },
      {
        path: ROUTES.specialist,
        element: <SpecialistLayout />,
        children: [
          { index: true, element: <Navigate to={`${ROUTES.specialist}/${QUEUE[0].ref}`} replace /> },
          { path: ':caseRef', element: <CaseReviewScreen /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>
  );
}
