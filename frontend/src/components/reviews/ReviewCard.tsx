'use client';

import RatingStars from './RatingStars';

interface ReviewCardProps {
  review: {
    id: string;
    projectId: string;
    projectTitle?: string;
    reviewerAddress: string;
    reviewerType: 'client' | 'developer';
    rating: number;
    comment: string | null;
    createdAt: string;
  };
}

export default function ReviewCard({ review }: ReviewCardProps) {
  const truncatedAddress = `${review.reviewerAddress.slice(0, 6)}...${review.reviewerAddress.slice(-4)}`;
  const date = new Date(review.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <RatingStars rating={review.rating} size="sm" />
            <span className="text-white font-semibold text-sm">{review.rating}.0</span>
          </div>
          {review.projectTitle && (
            <p className="text-gray-400 text-sm">
              Project: <span className="text-gray-300">{review.projectTitle}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">{date}</p>
          <p className="text-gray-500 text-xs font-mono mt-1">
            by {truncatedAddress}
          </p>
        </div>
      </div>
      {review.comment && (
        <p className="text-gray-300 text-sm leading-relaxed">{review.comment}</p>
      )}
    </div>
  );
}
