export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");

  if (!lat || !lon) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }

  const res = await fetch(
    `https://gadgets.buienradar.nl/data/raintext?lat=${lat}&lon=${lon}`,
  );
  const text = await res.text();

  return new Response(text, {
    headers: { "Content-Type": "text/plain" },
  });
}
