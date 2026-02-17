'use client';

import { useEffect, useState } from 'react';
import ReviewCard from './ReviewCard';
import RatingStars from './RatingStars';

interface ReviewData {
  id: string;
  projectId: string;
  projectTitle: string;
  reviewerAddress: string;
  reviewerType: 'client' | 'developer';
  rating: number;
  comment: string | null;
  createdAt: string;
}

interface ReviewListProps {
  address: string;
  type: 'developer' | 'client';
}

export default function ReviewList({ address, type }: ReviewListProps) {
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [totalReviews, setTotalReviews] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<Record<string, number>>({
    '1': 0, '2': 0, '3': 0, '4': 0, '5': 0,
  });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  useEffect(() => {
    let cancelled = false;

    const doFetch = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/reviews/${type}/${address}?limit=${limit}&offset=0`
        );

        if (!response.ok || cancelled) return;

        const data = await response.json();
        if (cancelled) return;

        setAverageRating(data.averageRating);
        setTotalReviews(data.totalReviews);
        setRatingDistribution(data.ratingDistribution || { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 });
        setHasMore(data.pagination.hasMore);
        setOffset(0);
        setReviews(data.reviews);
      } catch {
        // Reviews are non-critical, don't break the page
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    doFetch();
    return () => { cancelled = true; };
  }, [address, type]);

  const loadMore = async () => {
    const newOffset = offset + limit;
    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/reviews/${type}/${address}?limit=${limit}&offset=${newOffset}`
      );

      if (!response.ok) return;

      const data = await response.json();
      setHasMore(data.pagination.hasMore);
      setOffset(newOffset);
      setReviews(prev => [...prev, ...data.reviews]);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Rating Summary */}
      <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-6">
        <h3 className="text-white font-semibold text-lg mb-4">Reviews & Ratings</h3>

        {totalReviews === 0 ? (
          <p className="text-gray-400">No reviews yet.</p>
        ) : (
          <div className="flex items-start gap-8">
            {/* Average Rating */}
            <div className="text-center">
              <p className="text-4xl font-bold text-white mb-1">
                {averageRating?.toFixed(1)}
              </p>
              <RatingStars rating={Math.round(averageRating || 0)} size="md" />
              <p className="text-gray-400 text-sm mt-1">
                {totalReviews} review{totalReviews !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Distribution */}
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = ratingDistribution[String(star)] || 0;
                const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 w-3">{star}</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-gray-500 w-8 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Review List */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-3 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Load more reviews'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
