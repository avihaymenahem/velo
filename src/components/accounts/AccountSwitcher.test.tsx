import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountSwitcher } from "./AccountSwitcher";
import { useAccountStore } from "@/stores/accountStore";

describe("AccountSwitcher", () => {
  beforeEach(() => {
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
    });
  });

  it("shows add account button when no accounts", () => {
    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);
    expect(screen.getByText("Add Account")).toBeInTheDocument();
  });

  it("shows initial letter when avatarUrl is null", () => {
    useAccountStore.setState({
      accounts: [
        {
          id: "1",
          email: "john@example.com",
          displayName: "John Doe",
          avatarUrl: null,
          isActive: true,
        },
      ],
      activeAccountId: "1",
    });

    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("shows initial letter when avatar image fails to load", () => {
    useAccountStore.setState({
      accounts: [
        {
          id: "1",
          email: "john@example.com",
          displayName: "John Doe",
          avatarUrl: "https://broken-url.example.com/avatar.png",
          isActive: true,
        },
      ],
      activeAccountId: "1",
    });

    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);

    const img = screen.getByRole("img");
    fireEvent.error(img);

    expect(screen.getByText("J")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("falls back to email initial when displayName is null", () => {
    useAccountStore.setState({
      accounts: [
        {
          id: "1",
          email: "alice@example.com",
          displayName: null,
          avatarUrl: null,
          isActive: true,
        },
      ],
      activeAccountId: "1",
    });

    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("shows display name and email in trigger when expanded", () => {
    useAccountStore.setState({
      accounts: [
        {
          id: "1",
          email: "john@example.com",
          displayName: "John Doe",
          avatarUrl: null,
          isActive: true,
        },
      ],
      activeAccountId: "1",
    });

    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("john@example.com")).toBeInTheDocument();
  });

  it("opens dropdown with account list on click", () => {
    useAccountStore.setState({
      accounts: [
        {
          id: "1",
          email: "john@example.com",
          displayName: "John Doe",
          avatarUrl: null,
          isActive: true,
        },
        {
          id: "2",
          email: "jane@example.com",
          displayName: "Jane Smith",
          avatarUrl: null,
          isActive: false,
        },
      ],
      activeAccountId: "1",
    });

    render(<AccountSwitcher collapsed={false} onAddAccount={() => {}} />);

    // Click the trigger to open dropdown
    fireEvent.click(screen.getByText("John Doe"));

    // Both accounts should appear in the dropdown
    expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    expect(screen.getByText("Add account")).toBeInTheDocument();
  });
});
