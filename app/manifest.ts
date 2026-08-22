import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beyond the Stops",
    short_name: "Beyond the Stops",
    description:
      "Stories, sights and sounds that unfold as you travel through the city.",
    start_url: "/tours",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#171717",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
