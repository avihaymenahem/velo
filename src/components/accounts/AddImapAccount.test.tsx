import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddImapAccount } from "./AddImapAccount";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockInsertImapAccount = vi.fn().mockResolvedValue(undefined);
const mockInsertOAuthImapAccount = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/db/accounts", () => ({
  insertImapAccount: (...args: unknown[]) => mockInsertImapAccount(...args),
  insertOAuthImapAccount: (...args: unknown[]) =>
    mockInsertOAuthImapAccount(...args),
}));

const mockAddAccount = vi.fn();

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: vi.fn(
    (
      selector: (s: { addAccount: typeof mockAddAccount }) => unknown,
    ) => selector({ addAccount: mockAddAccount }),
  ),
}));

const mockDiscoverSettings = vi.fn();
const mockGetDefaultImapPort = vi.fn(
  (s: string) => (s === "ssl" ? 993 : s === "starttls" ? 143 : 143),
);
const mockGetDefaultSmtpPort = vi.fn(
  (s: string) => (s === "ssl" ? 465 : s === "starttls" ? 587 : 25),
);

vi.mock("@/services/imap/autoDiscovery", () => ({
  discoverSettings: (...args: unknown[]) => mockDiscoverSettings(...args),
  getDefaultImapPort: (...args: unknown[]) =>
    mockGetDefaultImapPort(...args),
  getDefaultSmtpPort: (...args: unknown[]) =>
    mockGetDefaultSmtpPort(...args),
}));

vi.mock("@/services/oauth/providers", () => ({
  getOAuthProvider: vi.fn(() => ({
    id: "microsoft",
    name: "Microsoft",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scopes: ["offline_access"],
    usePkce: true,
  })),
}));

const mockStartProviderOAuthFlow = vi.fn();

vi.mock("@/services/oauth/oauthFlow", () => ({
  startProviderOAuthFlow: (...args: unknown[]) =>
    mockStartProviderOAuthFlow(...args),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// CSSTransition mock: render children immediately when `in` is true
vi.mock("react-transition-group", () => ({
  CSSTransition: ({
    in: inProp,
    children,
    unmountOnExit,
  }: {
    in: boolean;
    children: React.ReactNode;
    unmountOnExit?: boolean;
  }) => {
    if (!inProp && unmountOnExit) return null;
    return <>{children}</>;
  },
}));

import { invoke } from "@tauri-apps/api/core";

// ── Helpers ────────────────────────────────────────────────────────────────

const defaultProps = {
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  onBack: vi.fn(),
};

function renderComponent(props = {}) {
  return render(<AddImapAccount {...defaultProps} {...props} />);
}

/** Fill basic step requirements so Next becomes enabled */
function fillBasicStep() {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "user@example.com" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("Enter your email password or app password"),
    { target: { value: "secret123" } },
  );
}

/** Navigate to a specific step by filling required fields and clicking Next */
function navigateToStep(step: "imap" | "smtp" | "test") {
  fillBasicStep();
  fireEvent.click(screen.getByText("Next"));
  if (step === "imap") return;

  // Fill IMAP step
  fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
    target: { value: "imap.test.com" },
  });
  fireEvent.click(screen.getByText("Next"));
  if (step === "smtp") return;

  // Fill SMTP step
  fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
    target: { value: "smtp.test.com" },
  });
  fireEvent.click(screen.getByText("Next"));
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  crypto.randomUUID = vi.fn(
    () => "test-uuid-1234",
  ) as () => `${string}-${string}-${string}-${string}-${string}`;
  mockDiscoverSettings.mockReturnValue(null);
});

// ── Phase 1: Tests for existing behavior ───────────────────────────────────

describe("AddImapAccount", () => {
  // ── 1. Rendering & Initial State ──────────────────────────────────────

  describe("rendering and initial state", () => {
    it("renders the modal with correct title", () => {
      renderComponent();
      expect(
        screen.getByText("Add IMAP/SMTP Account"),
      ).toBeInTheDocument();
    });

    it("renders all 4 step labels", () => {
      renderComponent();
      expect(screen.getByText("Account")).toBeInTheDocument();
      expect(screen.getByText("Incoming")).toBeInTheDocument();
      expect(screen.getByText("Outgoing")).toBeInTheDocument();
      expect(screen.getByText("Verify")).toBeInTheDocument();
    });

    it("starts on basic step with email input", () => {
      renderComponent();
      expect(
        screen.getByPlaceholderText("you@example.com"),
      ).toBeInTheDocument();
    });

    it("renders Back, Cancel, and Next buttons", () => {
      renderComponent();
      expect(screen.getByText("Back")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
      expect(screen.getByText("Next")).toBeInTheDocument();
    });

    it("Next button is disabled when form is empty", () => {
      renderComponent();
      const nextBtn = screen.getByText("Next").closest("button")!;
      expect(nextBtn).toBeDisabled();
    });
  });

  // ── 2. Step Navigation ────────────────────────────────────────────────

  describe("step navigation", () => {
    it("enables Next when email and password are filled", () => {
      renderComponent();
      fillBasicStep();
      const nextBtn = screen.getByText("Next").closest("button")!;
      expect(nextBtn).not.toBeDisabled();
    });

    it("navigates from basic to imap step", () => {
      renderComponent();
      navigateToStep("imap");
      expect(
        screen.getByPlaceholderText("imap.example.com"),
      ).toBeInTheDocument();
    });

    it("navigates from imap to smtp step", () => {
      renderComponent();
      navigateToStep("smtp");
      expect(
        screen.getByPlaceholderText("smtp.example.com"),
      ).toBeInTheDocument();
    });

    it("navigates from smtp to test step", () => {
      renderComponent();
      navigateToStep("test");
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    it("Back navigates from imap to basic", () => {
      renderComponent();
      navigateToStep("imap");
      fireEvent.click(screen.getByText("Back"));
      expect(
        screen.getByPlaceholderText("you@example.com"),
      ).toBeInTheDocument();
    });

    it("Back on basic step calls onBack", () => {
      renderComponent();
      fireEvent.click(screen.getByText("Back"));
      expect(defaultProps.onBack).toHaveBeenCalled();
    });

    it("Cancel calls onClose", () => {
      renderComponent();
      fireEvent.click(screen.getByText("Cancel"));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  // ── 3. Basic Step ─────────────────────────────────────────────────────

  describe("basic step", () => {
    it("triggers auto-discovery on email blur", () => {
      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@fastmail.com" },
      });
      fireEvent.blur(emailInput);
      expect(mockDiscoverSettings).toHaveBeenCalledWith("user@fastmail.com");
    });

    it("fills IMAP/SMTP settings from auto-discovery", () => {
      mockDiscoverSettings.mockReturnValue({
        settings: {
          imapHost: "imap.fastmail.com",
          imapPort: 993,
          imapSecurity: "ssl",
          smtpHost: "smtp.fastmail.com",
          smtpPort: 465,
          smtpSecurity: "ssl",
        },
        authMethods: ["password"],
      });
      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@fastmail.com" },
      });
      fireEvent.blur(emailInput);

      // Fill password and advance to IMAP step to verify settings were applied
      fireEvent.change(
        screen.getByPlaceholderText(
          "Enter your email password or app password",
        ),
        { target: { value: "pass" } },
      );
      fireEvent.click(screen.getByText("Next"));

      expect(screen.getByDisplayValue("imap.fastmail.com")).toBeInTheDocument();
    });

    it("does not overwrite manually entered hosts on discovery", () => {
      mockDiscoverSettings.mockReturnValue({
        settings: {
          imapHost: "discovered.com",
          imapPort: 993,
          imapSecurity: "ssl",
          smtpHost: "discovered-smtp.com",
          smtpPort: 465,
          smtpSecurity: "ssl",
        },
        authMethods: ["password"],
      });
      renderComponent();

      // Fill and advance to imap step first, set host manually, then go back
      fillBasicStep();
      fireEvent.click(screen.getByText("Next"));
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "my-custom-host.com" },
      });
      fireEvent.click(screen.getByText("Back"));

      // Blur email again — discovery should not re-apply since imapHost is already set
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.blur(emailInput);
      // Discovery already applied once, so should not apply again (discoveryApplied flag)
      // Navigate back to IMAP step to verify
      fireEvent.click(screen.getByText("Next"));
      expect(
        screen.getByDisplayValue("my-custom-host.com"),
      ).toBeInTheDocument();
    });

    it("accepts input in username field", () => {
      renderComponent();
      const usernameInput = screen.getByPlaceholderText(
        "Leave blank to use your email address",
      );
      fireEvent.change(usernameInput, {
        target: { value: "custom-user" },
      });
      expect(screen.getByDisplayValue("custom-user")).toBeInTheDocument();
    });

    it("accepts input in password field", () => {
      renderComponent();
      const pwInput = screen.getByPlaceholderText(
        "Enter your email password or app password",
      );
      fireEvent.change(pwInput, { target: { value: "mypassword" } });
      expect(screen.getByDisplayValue("mypassword")).toBeInTheDocument();
    });
  });

  // ── 4. IMAP Step ──────────────────────────────────────────────────────

  describe("IMAP step", () => {
    it("renders IMAP host and port inputs", () => {
      renderComponent();
      navigateToStep("imap");
      expect(
        screen.getByPlaceholderText("imap.example.com"),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("993")).toBeInTheDocument();
    });

    it("updates port when security changes", () => {
      renderComponent();
      navigateToStep("imap");
      const securitySelect = document.getElementById(
        "imap-security",
      ) as HTMLSelectElement;
      fireEvent.change(securitySelect, { target: { value: "starttls" } });
      expect(mockGetDefaultImapPort).toHaveBeenCalledWith("starttls");
    });

    it("toggles accept-invalid-certs checkbox", () => {
      renderComponent();
      navigateToStep("imap");
      const checkbox = document.getElementById(
        "accept-invalid-certs",
      ) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
    });

    it("Next is disabled when IMAP host is empty", () => {
      renderComponent();
      navigateToStep("imap");
      // Clear the host
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "" },
      });
      const nextBtn = screen.getByText("Next").closest("button")!;
      expect(nextBtn).toBeDisabled();
    });
  });

  // ── 5. SMTP Step ──────────────────────────────────────────────────────

  describe("SMTP step", () => {
    it("renders SMTP host and port inputs", () => {
      renderComponent();
      navigateToStep("smtp");
      expect(
        screen.getByPlaceholderText("smtp.example.com"),
      ).toBeInTheDocument();
    });

    it("updates port when security changes", () => {
      renderComponent();
      navigateToStep("smtp");
      const securitySelect = document.getElementById(
        "smtp-security",
      ) as HTMLSelectElement;
      fireEvent.change(securitySelect, { target: { value: "starttls" } });
      expect(mockGetDefaultSmtpPort).toHaveBeenCalledWith("starttls");
    });

    it("same-credentials checkbox is checked by default", () => {
      renderComponent();
      navigateToStep("smtp");
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it("unchecking same-credentials reveals SMTP credential fields", () => {
      renderComponent();
      navigateToStep("smtp");
      // Initially no SMTP password field
      expect(screen.queryByPlaceholderText("SMTP password")).not.toBeInTheDocument();

      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);

      expect(
        screen.getByPlaceholderText("SMTP password"),
      ).toBeInTheDocument();
    });
  });

  // ── 6. OAuth Flow ─────────────────────────────────────────────────────

  describe("OAuth flow", () => {
    function setupOAuthDiscovery() {
      mockDiscoverSettings.mockReturnValue({
        settings: {
          imapHost: "outlook.office365.com",
          imapPort: 993,
          imapSecurity: "ssl",
          smtpHost: "smtp.office365.com",
          smtpPort: 587,
          smtpSecurity: "starttls",
        },
        authMethods: ["oauth2", "password"],
        oauthProviderId: "microsoft",
      });
    }

    it("shows auth mode selector when discovery detects OAuth", () => {
      setupOAuthDiscovery();
      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);

      expect(screen.getByText("Password")).toBeInTheDocument();
      expect(screen.getByText("OAuth2")).toBeInTheDocument();
    });

    it("selecting OAuth2 hides password and shows Client ID", () => {
      setupOAuthDiscovery();
      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);

      fireEvent.click(screen.getByText("OAuth2"));

      expect(
        screen.queryByPlaceholderText(
          "Enter your email password or app password",
        ),
      ).not.toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Microsoft app Client ID"),
      ).toBeInTheDocument();
    });

    it("Connect button is disabled without Client ID", () => {
      setupOAuthDiscovery();
      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);
      fireEvent.click(screen.getByText("OAuth2"));

      const connectBtn = screen
        .getByText("Sign in with Microsoft")
        .closest("button")!;
      expect(connectBtn).toBeDisabled();
    });

    it("successful OAuth flow shows Connected message", async () => {
      setupOAuthDiscovery();
      mockStartProviderOAuthFlow.mockResolvedValue({
        tokens: {
          access_token: "acc-tok",
          refresh_token: "ref-tok",
          expires_in: 3600,
        },
        userInfo: { email: "user@outlook.com", name: "Test User" },
      });

      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);
      fireEvent.click(screen.getByText("OAuth2"));

      // Enter Client ID
      fireEvent.change(
        screen.getByPlaceholderText("Microsoft app Client ID"),
        { target: { value: "my-client-id" } },
      );
      fireEvent.click(
        screen.getByText("Sign in with Microsoft").closest("button")!,
      );

      await waitFor(() => {
        expect(screen.getByText("user@outlook.com")).toBeInTheDocument();
      });
    });

    it("displays OAuth error", async () => {
      setupOAuthDiscovery();
      mockStartProviderOAuthFlow.mockRejectedValue(
        new Error("OAuth failed"),
      );

      renderComponent();
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);
      fireEvent.click(screen.getByText("OAuth2"));

      fireEvent.change(
        screen.getByPlaceholderText("Microsoft app Client ID"),
        { target: { value: "my-client-id" } },
      );
      fireEvent.click(
        screen.getByText("Sign in with Microsoft").closest("button")!,
      );

      await waitFor(() => {
        expect(screen.getByText("OAuth failed")).toBeInTheDocument();
      });
    });
  });

  // ── 7. Connection Testing ─────────────────────────────────────────────

  describe("connection testing", () => {
    it("renders Test Connection button on test step", () => {
      renderComponent();
      navigateToStep("test");
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });

    it("invokes both imap_test_connection and smtp_test_connection", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockResolvedValueOnce("IMAP OK" as never);
      mockInvoke.mockResolvedValueOnce({
        success: true,
        message: "SMTP OK",
      } as never);

      renderComponent();
      navigateToStep("test");
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "imap_test_connection",
          expect.objectContaining({
            config: expect.objectContaining({ host: "imap.test.com" }),
          }),
        );
        expect(mockInvoke).toHaveBeenCalledWith(
          "smtp_test_connection",
          expect.objectContaining({
            config: expect.objectContaining({ host: "smtp.test.com" }),
          }),
        );
      });
    });

    it("shows success state for IMAP test", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "IMAP OK" as never;
        return { success: true, message: "SMTP OK" } as never;
      });

      renderComponent();
      navigateToStep("test");
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("IMAP OK")).toBeInTheDocument();
      });
    });

    it("shows error state for failed IMAP test", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection")
          throw new Error("Connection refused");
        return { success: true, message: "SMTP OK" } as never;
      });

      renderComponent();
      navigateToStep("test");
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Connection refused")).toBeInTheDocument();
      });
    });

    it("shows error state for failed SMTP test", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: false, message: "Auth failed" } as never;
      });

      renderComponent();
      navigateToStep("test");
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(screen.getByText("Auth failed")).toBeInTheDocument();
      });
    });

    it("uses smtpPassword for SMTP test when sameCredentials is false", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });

      renderComponent();
      fillBasicStep();
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step — uncheck same password, enter SMTP password
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);
      fireEvent.change(screen.getByPlaceholderText("SMTP password"), {
        target: { value: "different-smtp-pass" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test step
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "smtp_test_connection",
          expect.objectContaining({
            config: expect.objectContaining({
              password: "different-smtp-pass",
            }),
          }),
        );
      });
    });

    it("uses imapUsername for SMTP test when set", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });

      renderComponent();
      // Basic step — set custom username
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("Leave blank to use your email address"),
        { target: { value: "custom-imap-user" } },
      );
      fireEvent.change(
        screen.getByPlaceholderText(
          "Enter your email password or app password",
        ),
        { target: { value: "pass" } },
      );
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test step
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "smtp_test_connection",
          expect.objectContaining({
            config: expect.objectContaining({
              username: "custom-imap-user",
            }),
          }),
        );
      });
    });
  });

  // ── 8. Save Flow ──────────────────────────────────────────────────────

  describe("save flow", () => {
    function setupSuccessfulTests() {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });
    }

    async function navigateAndPassTests() {
      navigateToStep("test");
      fireEvent.click(screen.getByText("Test Connection"));
      await waitFor(() => {
        expect(screen.getByText("Add Account")).toBeInTheDocument();
      });
    }

    it("Add Account button is disabled until both tests pass", () => {
      renderComponent();
      navigateToStep("test");
      const addBtn = screen.getByText("Add Account").closest("button")!;
      expect(addBtn).toBeDisabled();
    });

    it("Add Account button is enabled when both tests pass", async () => {
      setupSuccessfulTests();
      renderComponent();
      await navigateAndPassTests();

      await waitFor(() => {
        const addBtn = screen.getByText("Add Account").closest("button")!;
        expect(addBtn).not.toBeDisabled();
      });
    });

    it("calls insertImapAccount with correct params", async () => {
      setupSuccessfulTests();
      renderComponent();
      // Fill basic step
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Enter your email password or app password",
        ),
        { target: { value: "secret123" } },
      );
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test
      fireEvent.click(screen.getByText("Test Connection"));
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      // Save
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(mockInsertImapAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "test-uuid-1234",
            email: "user@example.com",
            imapHost: "imap.test.com",
            smtpHost: "smtp.test.com",
            authMethod: "password",
            password: "secret123",
          }),
        );
      });
    });

    it("passes smtpPassword separately when sameCredentials is unchecked", async () => {
      setupSuccessfulTests();
      renderComponent();

      // Fill basic step
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Enter your email password or app password",
        ),
        { target: { value: "imap-pass" } },
      );
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step — uncheck same credentials, enter different SMTP password
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);
      fireEvent.change(screen.getByPlaceholderText("SMTP password"), {
        target: { value: "smtp-pass-different" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test & Save
      fireEvent.click(screen.getByText("Test Connection"));
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(mockInsertImapAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            password: "imap-pass",
            smtpPassword: "smtp-pass-different",
          }),
        );
      });
    });

    it("calls addAccount on the store after save", async () => {
      setupSuccessfulTests();
      renderComponent();
      await navigateAndPassTests();
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(mockAddAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "test-uuid-1234",
            isActive: true,
          }),
        );
      });
    });

    it("calls onSuccess after successful save", async () => {
      setupSuccessfulTests();
      renderComponent();
      await navigateAndPassTests();
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(defaultProps.onSuccess).toHaveBeenCalled();
      });
    });

    it("displays save error when insertImapAccount fails", async () => {
      setupSuccessfulTests();
      mockInsertImapAccount.mockRejectedValueOnce(
        new Error("DB write failed"),
      );
      renderComponent();
      await navigateAndPassTests();
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(screen.getByText("DB write failed")).toBeInTheDocument();
      });
    });

    it("calls insertOAuthImapAccount for OAuth save", async () => {
      mockDiscoverSettings.mockReturnValue({
        settings: {
          imapHost: "outlook.office365.com",
          imapPort: 993,
          imapSecurity: "ssl",
          smtpHost: "smtp.office365.com",
          smtpPort: 587,
          smtpSecurity: "starttls",
        },
        authMethods: ["oauth2", "password"],
        oauthProviderId: "microsoft",
      });
      mockStartProviderOAuthFlow.mockResolvedValue({
        tokens: {
          access_token: "acc-tok",
          refresh_token: "ref-tok",
          expires_in: 3600,
        },
        userInfo: { email: "user@outlook.com", name: "Test User" },
      });
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });

      renderComponent();
      // Setup OAuth
      const emailInput = screen.getByPlaceholderText("you@example.com");
      fireEvent.change(emailInput, {
        target: { value: "user@outlook.com" },
      });
      fireEvent.blur(emailInput);
      fireEvent.click(screen.getByText("OAuth2"));
      fireEvent.change(
        screen.getByPlaceholderText("Microsoft app Client ID"),
        { target: { value: "client-123" } },
      );
      fireEvent.click(
        screen.getByText("Sign in with Microsoft").closest("button")!,
      );

      await waitFor(() => {
        expect(screen.getByText("user@outlook.com")).toBeInTheDocument();
      });

      // Navigate through steps
      fireEvent.click(screen.getByText("Next"));
      fireEvent.click(screen.getByText("Next"));
      fireEvent.click(screen.getByText("Next"));

      // Test connections
      fireEvent.click(screen.getByText("Test Connection"));
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(mockInsertOAuthImapAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            oauthProvider: "microsoft",
            oauthClientId: "client-123",
            accessToken: "acc-tok",
            refreshToken: "ref-tok",
          }),
        );
      });
    });
  });

  // ── Phase 2: Tests for new feature (RED) ───────────────────────────────

  describe("separate SMTP credentials", () => {
    it("checkbox label says 'Use same credentials as IMAP'", () => {
      renderComponent();
      navigateToStep("smtp");
      expect(
        screen.getByLabelText("Use same credentials as IMAP"),
      ).toBeInTheDocument();
    });

    it("unchecking shows both SMTP username and SMTP password fields", () => {
      renderComponent();
      navigateToStep("smtp");
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);

      expect(
        screen.getByPlaceholderText("Leave blank to use IMAP username"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("SMTP password"),
      ).toBeInTheDocument();
    });

    it("SMTP connection test uses smtpUsername when set", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });

      renderComponent();
      fillBasicStep();
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step — uncheck same credentials, enter SMTP username
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);
      fireEvent.change(
        screen.getByPlaceholderText("Leave blank to use IMAP username"),
        { target: { value: "smtp-specific-user" } },
      );
      fireEvent.change(screen.getByPlaceholderText("SMTP password"), {
        target: { value: "smtp-pass" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test step
      fireEvent.click(screen.getByText("Test Connection"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "smtp_test_connection",
          expect.objectContaining({
            config: expect.objectContaining({
              username: "smtp-specific-user",
              password: "smtp-pass",
            }),
          }),
        );
      });
    });

    it("save passes smtpUsername and smtpPassword to insertImapAccount", async () => {
      const mockInvoke = vi.mocked(invoke);
      mockInvoke.mockImplementation(async (cmd) => {
        if (cmd === "imap_test_connection") return "OK" as never;
        return { success: true, message: "OK" } as never;
      });

      renderComponent();
      // Basic step
      fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(
        screen.getByPlaceholderText(
          "Enter your email password or app password",
        ),
        { target: { value: "imap-pass" } },
      );
      fireEvent.click(screen.getByText("Next"));
      // IMAP step
      fireEvent.change(screen.getByPlaceholderText("imap.example.com"), {
        target: { value: "imap.test.com" },
      });
      fireEvent.click(screen.getByText("Next"));
      // SMTP step — separate credentials
      fireEvent.change(screen.getByPlaceholderText("smtp.example.com"), {
        target: { value: "smtp.test.com" },
      });
      const checkbox = document.getElementById(
        "smtp-same-credentials",
      ) as HTMLInputElement;
      fireEvent.click(checkbox);
      fireEvent.change(
        screen.getByPlaceholderText("Leave blank to use IMAP username"),
        { target: { value: "smtp-user@relay.com" } },
      );
      fireEvent.change(screen.getByPlaceholderText("SMTP password"), {
        target: { value: "smtp-secret" },
      });
      fireEvent.click(screen.getByText("Next"));
      // Test & Save
      fireEvent.click(screen.getByText("Test Connection"));
      await waitFor(() => {
        expect(
          screen.getByText("Add Account").closest("button"),
        ).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText("Add Account"));

      await waitFor(() => {
        expect(mockInsertImapAccount).toHaveBeenCalledWith(
          expect.objectContaining({
            password: "imap-pass",
            smtpUsername: "smtp-user@relay.com",
            smtpPassword: "smtp-secret",
          }),
        );
      });
    });
  });

  // ── 9. Keyboard Navigation ────────────────────────────────────────────

  describe("keyboard navigation", () => {
    it("Enter advances step when canGoNext is true", () => {
      renderComponent();
      fillBasicStep();

      const container = document.querySelector(".p-4")!;
      fireEvent.keyDown(container, { key: "Enter" });

      // Should have advanced to IMAP step
      expect(
        screen.getByPlaceholderText("imap.example.com"),
      ).toBeInTheDocument();
    });

    it("Enter does not advance on test step", () => {
      renderComponent();
      navigateToStep("test");

      const container = document.querySelector(".p-4")!;
      fireEvent.keyDown(container, { key: "Enter" });

      // Still on test step
      expect(screen.getByText("Test Connection")).toBeInTheDocument();
    });
  });
});
