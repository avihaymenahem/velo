import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ThreadWindow from "./ThreadWindow";
import ComposerWindow from "./ComposerWindow";
import "./styles/globals.css";

const params = new URLSearchParams(window.location.search);
const isThreadWindow = params.has("thread") && params.has("account");
const isComposerWindow = params.has("compose");

function Root() {
  if (isThreadWindow) return <ThreadWindow />;
  if (isComposerWindow) return <ComposerWindow />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
