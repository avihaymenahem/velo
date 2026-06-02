import { render, screen } from "@testing-library/react";
import { AppLoadingScreen } from "./AppLoadingScreen";
import i18n from "@/i18n";

describe("AppLoadingScreen", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("localizes the startup loading copy in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<AppLoadingScreen />);

    expect(screen.getByText("正在加载收件箱...")).toBeInTheDocument();
    expect(screen.queryByText("Loading your inbox...")).not.toBeInTheDocument();
  });
});
