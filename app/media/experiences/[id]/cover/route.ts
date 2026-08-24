import { createPublicServerClient } from "@/lib/supabase/public-server";

type CoverRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: CoverRouteProps
) {
  const { id } = await params;

  const supabase =
    createPublicServerClient();

  const {
    data: experience,
    error: experienceError,
  } = await supabase
    .from("experiences")
    .select(`
      cover_image_path
    `)
    .eq("id", id)
    .eq("status", "published")
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .maybeSingle();

  if (
    experienceError ||
    !experience?.cover_image_path
  ) {
    return new Response(
      "Image not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=300",
        },
      }
    );
  }

  const {
    data: image,
    error: imageError,
  } = await supabase.storage
    .from("tour-media")
    .download(
      experience.cover_image_path
    );

  if (imageError || !image) {
    return new Response(
      "Image not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=300",
        },
      }
    );
  }

  return new Response(
    image,
    {
      status: 200,
      headers: {
        "Content-Type":
          image.type ||
          "application/octet-stream",
        "Content-Length":
          String(image.size),
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options":
          "nosniff",
      },
    }
  );
}
