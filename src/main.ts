import "./styles.css";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) {
  throw new Error("#app missing");
}

new App(root);
