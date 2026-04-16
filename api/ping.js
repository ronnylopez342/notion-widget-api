export function GET() {
  return new Response(
    JSON.stringify({ ok: true, message: "PING OK" }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
