import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Visual search not configured" },
      { status: 503 }
    );
  }

  const { image } = await req.json();
  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "No image provided" },
      { status: 400 }
    );
  }

  // Limit payload size (~4MB base64 ≈ 3MB image)
  if (image.length > 5_500_000) {
    return NextResponse.json(
      { error: "Image too large. Please use a smaller photo." },
      { status: 413 }
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              "You identify products in photos. Return ONLY a short search term (1-4 words) for finding this product in an online store. Examples: 'Samsung Galaxy phone', 'Nike running shoes', 'baby diapers'. No extra text.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[visual-search] OpenAI error:", response.status, errText);
      return NextResponse.json(
        { error: `OpenAI error (${response.status}): ${errText.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const searchTerm = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ searchTerm });
  } catch (err) {
    console.error("[visual-search] unexpected error:", err);
    return NextResponse.json(
      { error: "Visual search failed" },
      { status: 500 }
    );
  }
}
