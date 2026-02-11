import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ThreadWindow from "./ThreadWindow";
import "./styles/globals.css";

const params = new URLSearchParams(window.location.search);
const isThreadWindow = params.has("thread") && params.has("account");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isThreadWindow ? <ThreadWindow /> : <App />}
  </StrictMode>,
);
