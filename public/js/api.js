export async function fetchConfig() {
  const response = await fetch("/api/config");
  return response.json();
}

export async function submitSamJob(payload) {
  const response = await fetch("/api/process", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  return {
    response,
    result: await response.json()
  };
}
