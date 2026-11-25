import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn() }));
vi.mock("./storage", () => ({ storageGetSignedUrl: mocks.storageGetSignedUrl }));
vi.mock("./_core/env", () => ({ ENV: { forgeApiUrl: "https://llm.example.test", forgeApiKey: "test-key" } }));

import { reviewFoundImage } from "./image-review";

function completion(risk: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(risk) } }] }), { status: 200 });
}
const safeRisk = { containsFace: false, containsReadablePersonalInfo: false, containsIdOrPaymentCard: false, isIllustrationOrSynthetic: false, confidence: "high" };

const imagePath = (userId: number) => `/manus-storage/return/${userId}/Abc_12345678.jpg`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("reviewFoundImage", () => {
  it("validates the account's image path and sends a signed image to the vision model", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("https://cdn.example.test/signed-photo?temporary=1");
    const fetchMock = vi.fn().mockResolvedValue(completion(safeRisk));
    vi.stubGlobal("fetch", fetchMock);

    await expect(reviewFoundImage(imagePath(7311), 7311)).resolves.toEqual({ approved: true });
    expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith("return/7311/Abc_12345678.jpg");
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { model: string; messages: { content: { type: string; image_url?: { url: string } }[] }[] };
    expect(request.model).toBe("gpt-5-mini");
    expect(request.messages[1]?.content[1]?.image_url?.url).toBe("https://cdn.example.test/signed-photo?temporary=1");
  });

  it("rejects an image path owned by a different account before external calls", async () => {
    await expect(reviewFoundImage(imagePath(9002), 9001)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storageGetSignedUrl).not.toHaveBeenCalled();
  });

  it("blocks a photo containing a face or sensitive document", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("https://cdn.example.test/signed-photo");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion({ ...safeRisk, containsFace: true })));
    await expect(reviewFoundImage(imagePath(7312), 7312)).rejects.toThrow(/顔または人物/);
  });

  it("fails closed when the model output cannot be validated", async () => {
    mocks.storageGetSignedUrl.mockResolvedValue("https://cdn.example.test/signed-photo");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "not JSON" } }] }), { status: 200 })));
    await expect(reviewFoundImage(imagePath(7313), 7313)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
