import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EncryptedMessageBanner } from "./EncryptedMessageBanner";

vi.mock("@/services/pgp/pgpService", () => ({
  decryptMessage: vi.fn(),
  getCachedPassphrase: vi.fn(),
  cachePassphrase: vi.fn(),
  getPrivateKeyArmored: vi.fn(),
}));

describe("EncryptedMessageBanner", () => {
  const defaultProps = {
    messageId: "msg-1",
    accountId: "acc-1",
    ciphertext: "-----BEGIN PGP MESSAGE-----\nencrypted-data\n-----END PGP MESSAGE-----",
    onDecrypted: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const pgp = await import("@/services/pgp/pgpService");
    vi.mocked(pgp.decryptMessage).mockResolvedValue("Decrypted content");
    vi.mocked(pgp.getCachedPassphrase).mockReturnValue(null);
    vi.mocked(pgp.cachePassphrase).mockReturnValue(undefined);
    vi.mocked(pgp.getPrivateKeyArmored).mockResolvedValue("-----BEGIN PGP PRIVATE KEY BLOCK-----");
  });

  it("shows encrypted message text for valid ciphertext", async () => {
    render(<EncryptedMessageBanner {...defaultProps} />);
    const text = await screen.findByText("This message is encrypted with PGP");
    expect(text).toBeTruthy();
  });

  it("shows passphrase input when no cached passphrase", async () => {
    render(<EncryptedMessageBanner {...defaultProps} />);
    const input = await screen.findByPlaceholderText("Enter passphrase");
    expect(input).toBeTruthy();
  });

  it("shows remember checkbox when no cached passphrase", async () => {
    render(<EncryptedMessageBanner {...defaultProps} />);
    const checkbox = await screen.findByText("Remember for 15 min");
    expect(checkbox).toBeTruthy();
  });

  it("shows decrypt button when no cached passphrase", async () => {
    render(<EncryptedMessageBanner {...defaultProps} />);
    const btn = await screen.findByText("Decrypt");
    expect(btn).toBeTruthy();
  });

  it("shows error when ciphertext is not valid PGP", async () => {
    render(<EncryptedMessageBanner {...defaultProps} ciphertext="not-pgp-data" />);
    const errorText = await screen.findByText("Not a valid PGP encrypted message");
    expect(errorText).toBeTruthy();
  });

  it("shows cached passphrase state when passphrase is cached", async () => {
    const pgp = await import("@/services/pgp/pgpService");
    vi.mocked(pgp.getCachedPassphrase).mockReturnValue("cached-pass");
    render(<EncryptedMessageBanner {...defaultProps} />);
    const btn = await screen.findByText("Decrypt message");
    expect(btn).toBeTruthy();
  });

  it("shows loading state during decryption", async () => {
    const pgp = await import("@/services/pgp/pgpService");
    vi.mocked(pgp.getCachedPassphrase).mockReturnValue(null);
    vi.mocked(pgp.decryptMessage).mockReturnValue(new Promise<string>(() => {}));
    render(<EncryptedMessageBanner {...defaultProps} />);
    const input = await screen.findByPlaceholderText("Enter passphrase");
    fireEvent.change(input, { target: { value: "my-passphrase" } });
    fireEvent.click(screen.getByText("Decrypt"));
    const loadingText = await screen.findByText("Decrypting...");
    expect(loadingText).toBeTruthy();
  });

  it("shows error state when decryption fails", async () => {
    const pgp = await import("@/services/pgp/pgpService");
    vi.mocked(pgp.getCachedPassphrase).mockReturnValue(null);
    vi.mocked(pgp.decryptMessage).mockRejectedValue(new Error("Bad passphrase"));
    render(<EncryptedMessageBanner {...defaultProps} />);
    const input = await screen.findByPlaceholderText("Enter passphrase");
    fireEvent.change(input, { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByText("Decrypt"));
    const errorText = await screen.findByText("Bad passphrase");
    expect(errorText).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
