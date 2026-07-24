import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "../Sidebar";
import type { Conversation } from "@/lib/types";

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 1,
    peer: { id: 2, displayName: "Alice", username: "alice" },
    lastText: "Hello!",
    lastMessageAt: Date.now(),
    createdAt: Date.now() - 60_000,
    unread: 0,
    ...overrides,
  };
}

describe("Sidebar", () => {
  it("renders empty state when no conversations", () => {
    render(
      <Sidebar conversations={[]} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders conversation list", () => {
    const conversations = [
      makeConversation({ id: 1, peer: { id: 2, displayName: "Alice", username: "alice" } }),
      makeConversation({ id: 2, peer: { id: 3, displayName: "Bob", username: "bob" } }),
    ];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("calls onSelect when a conversation is clicked", () => {
    const onSelect = vi.fn();
    const conversations = [makeConversation({ id: 1 })];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("highlights the active conversation", () => {
    const conversations = [makeConversation({ id: 1 })];
    render(
      <Sidebar conversations={conversations} activeId={1} onSelect={vi.fn()} />
    );
    const button = screen.getByRole("button", { name: /alice/i });
    expect(button.className).toContain("accent");
  });

  it("shows unread badge when unread > 0", () => {
    const conversations = [makeConversation({ id: 1, unread: 5 })];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows 99+ for unread > 99", () => {
    const conversations = [makeConversation({ id: 1, unread: 150 })];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("shows conversation count", () => {
    const conversations = [
      makeConversation({ id: 1 }),
      makeConversation({ id: 2 }),
    ];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("2 conversations")).toBeInTheDocument();
  });

  it("shows singular for 1 conversation", () => {
    const conversations = [makeConversation({ id: 1 })];
    render(
      <Sidebar conversations={conversations} activeId={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText("1 conversation")).toBeInTheDocument();
  });
});
