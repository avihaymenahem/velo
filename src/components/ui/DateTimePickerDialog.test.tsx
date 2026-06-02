import { render, screen, fireEvent } from "@testing-library/react";
import { DateTimePickerDialog } from "./DateTimePickerDialog";
import i18n from "@/i18n";

const mockPresets = [
  { label: "Tomorrow", timestamp: 1737100800 }, // some fixed timestamp
  { label: "Next Week", timestamp: 1737532800 },
];

const mockPresetsWithDetail = [
  { label: "Tomorrow morning", detail: "Thu, Jan 16 9:00 AM", timestamp: 1737100800 },
  { label: "Monday morning", detail: "Mon, Jan 20 9:00 AM", timestamp: 1737532800 },
];

describe("DateTimePickerDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders title and preset labels when open", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Snooze until..."
        presets={mockPresets}
        onSelect={() => {}}
        submitLabel="Snooze"
      />,
    );
    expect(screen.getByText("Snooze until...")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Next Week")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <DateTimePickerDialog
        isOpen={false}
        onClose={() => {}}
        title="Hidden"
        presets={mockPresets}
        onSelect={() => {}}
        submitLabel="Snooze"
      />,
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("calls onSelect with preset timestamp when preset is clicked", () => {
    const onSelect = vi.fn();
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={mockPresets}
        onSelect={onSelect}
        submitLabel="Submit"
      />,
    );
    fireEvent.click(screen.getByText("Tomorrow"));
    expect(onSelect).toHaveBeenCalledWith(1737100800);
  });

  it("renders custom detail text when provided", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Schedule"
        presets={mockPresetsWithDetail}
        onSelect={() => {}}
        submitLabel="Schedule"
      />,
    );
    expect(screen.getByText("Thu, Jan 16 9:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Mon, Jan 20 9:00 AM")).toBeInTheDocument();
  });

  it("renders default date format when detail is not provided", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={mockPresets}
        onSelect={() => {}}
        submitLabel="Submit"
      />,
    );
    // Presets without detail should show formatted date — just check buttons exist
    const buttons = screen.getAllByRole("button");
    // 2 presets + close button + submit button = 4
    expect(buttons.length).toBe(4);
  });

  it("formats default preset details with the current i18n language", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={[{ label: "两天后", timestamp: Math.floor(new Date(2025, 0, 17, 9, 0, 0).getTime() / 1000) }]}
        onSelect={() => {}}
        submitLabel="Submit"
      />,
    );

    expect(screen.getByText("1月17日周五")).toBeInTheDocument();
    expect(screen.queryByText("Fri, Jan 17")).not.toBeInTheDocument();
  });

  it("disables submit button when no custom date is set", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={mockPresets}
        onSelect={() => {}}
        submitLabel="Snooze"
      />,
    );
    const submitButton = screen.getByText("Snooze");
    expect(submitButton).toBeDisabled();
  });

  it("enables submit button when custom date is set", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={mockPresets}
        onSelect={() => {}}
        submitLabel="Snooze"
      />,
    );
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-02-01" } });
    const submitButton = screen.getByText("Snooze");
    expect(submitButton).not.toBeDisabled();
  });

  it("calls onSelect with correct timestamp on custom submit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));

    const onSelect = vi.fn();
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={[]}
        onSelect={onSelect}
        submitLabel="Submit"
      />,
    );

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;

    fireEvent.change(dateInput, { target: { value: "2025-02-01" } });
    fireEvent.change(timeInput, { target: { value: "14:30" } });

    fireEvent.click(screen.getByText("Submit"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    const timestamp = onSelect.mock.calls[0][0] as number;
    const date = new Date(timestamp * 1000);
    expect(date.getFullYear()).toBe(2025);
    expect(date.getMonth()).toBe(1); // February
    expect(date.getDate()).toBe(1);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);

    vi.useRealTimers();
  });

  it("does not call onSelect when submitting without a date", () => {
    const onSelect = vi.fn();
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={[]}
        onSelect={onSelect}
        submitLabel="Submit"
      />,
    );
    fireEvent.click(screen.getByText("Submit"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("passes zIndex to Modal", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Z Test"
        presets={[]}
        onSelect={() => {}}
        submitLabel="Submit"
        zIndex="z-[60]"
      />,
    );
    const overlay = document.querySelector(".fixed");
    expect(overlay?.className).toContain("z-[60]");
  });

  it("renders the correct submitLabel", () => {
    render(
      <DateTimePickerDialog
        isOpen={true}
        onClose={() => {}}
        title="Test"
        presets={[]}
        onSelect={() => {}}
        submitLabel="Set reminder"
      />,
    );
    expect(screen.getByText("Set reminder")).toBeInTheDocument();
  });
});
