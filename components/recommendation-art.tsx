import type {
  RecommendationCategory,
} from "@/lib/destination-recommendations";

type RecommendationArtProps = {
  category: RecommendationCategory;
  imageUrl?: string;
  title: string;
};

export function RecommendationArt({
  category,
  imageUrl,
  title,
}: RecommendationArtProps) {
  if (imageUrl) {
    return (
      <div className="recommendationArtwork photo">
        <img src={imageUrl} alt="" />
      </div>
    );
  }

  return (
    <div className={`recommendationArtwork category-${category}`}>
      <svg viewBox="0 0 120 80" role="img" aria-label={`${title} category artwork`}>
        {category === "food_drink" && (
          <>
            <circle cx="59" cy="40" r="22" />
            <circle cx="59" cy="40" r="13" />
            <path d="M26 17v46M20 17v18h12V17M94 17v46M88 17c0 15 12 15 12 0" />
          </>
        )}
        {category === "museum" && (
          <>
            <path d="M18 31 60 12l42 19ZM25 66h70M31 34v27M50 34v27M70 34v27M89 34v27" />
          </>
        )}
        {category === "attraction" && (
          <path d="m60 11 9 19 21 3-15 15 4 21-19-10-19 10 4-21-15-15 21-3Z" />
        )}
        {category === "peace_quiet" && (
          <>
            <path d="M92 16C54 15 27 35 29 67c34 2 57-17 63-51Z" />
            <path d="M32 65c17-17 31-27 54-40" />
          </>
        )}
        {category === "great_view" && (
          <>
            <path d="M12 40c14-20 30-29 48-29s34 9 48 29c-14 20-30 29-48 29S26 60 12 40Z" />
            <circle cx="60" cy="40" r="14" />
          </>
        )}
        {category === "walk" && (
          <>
            <path d="M17 66c17-4 22-18 39-20s19 13 47 17M19 18c19 0 25 13 40 14s20-12 43-13" />
            <circle cx="18" cy="18" r="5" />
            <circle cx="103" cy="63" r="5" />
          </>
        )}
        {category === "shopping" && (
          <>
            <path d="M29 29h62l-5 39H34Z" />
            <path d="M45 31c0-25 30-25 30 0" />
          </>
        )}
        {category === "family" && (
          <>
            <circle cx="38" cy="26" r="10" />
            <circle cx="78" cy="24" r="12" />
            <circle cx="61" cy="45" r="8" />
            <path d="M20 67c1-19 35-19 36 0M58 67c1-22 40-22 42 0M48 69c0-14 26-14 27 0" />
          </>
        )}
        {category === "events" && (
          <>
            <rect x="22" y="18" width="76" height="51" rx="6" />
            <path d="M22 34h76M40 12v13M80 12v13M38 47h9M56 47h9M74 47h9M38 59h9M56 59h9" />
          </>
        )}
      </svg>
    </div>
  );
}
