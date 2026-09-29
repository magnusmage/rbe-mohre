import { Outlet } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { ReviewQueue } from './components/ReviewQueue';
import { ReviewerSignInModal } from './components/ReviewerSignInModal';
import {
  selectIsReviewerSignedIn,
  selectReviewerSignInError,
  selectReviewerSignInVerifying,
  verifyReviewerToken,
} from './state/specialistAuthSlice';

export function SpecialistLayout() {
  const dispatch = useAppDispatch();
  const isSignedIn = useAppSelector(selectIsReviewerSignedIn);
  const verifying = useAppSelector(selectReviewerSignInVerifying);
  const error = useAppSelector(selectReviewerSignInError);

  // Keep the modal open until the token is BOTH stored AND confirmed by a live
  // API call. A 401 during verification (or at any later moment) will clear
  // `isSignedIn` again through the response interceptor, so this same guard
  // also brings the modal back mid-session.
  const modalOpen = !isSignedIn || verifying;

  return (
    <div
      data-screen-label="Specialist"
      className="grid min-h-[calc(100vh-56px)] grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px]"
    >
      <ReviewerSignInModal
        open={modalOpen}
        busy={verifying}
        error={error}
        onSubmit={(token) => {
          void dispatch(verifyReviewerToken(token));
        }}
      />
      {isSignedIn && !verifying && (
        <>
          <ReviewQueue />
          <Outlet />
        </>
      )}
    </div>
  );
}
