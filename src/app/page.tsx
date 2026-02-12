import { Suspense } from "react";
import { PredictionsPage } from "./predictions-page";
import { MatchCardSkeleton } from "@/components/skeletons";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <MatchCardSkeleton key={i} />
          ))}
        </div>
      }
    >
      <PredictionsPage />
    </Suspense>
  );
}
