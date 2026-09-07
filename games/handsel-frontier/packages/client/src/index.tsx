import ReactDOM from "react-dom/client";
import { App } from "./App";
import { setup } from "./mud/setup";
import { MUDProvider } from "./MUDContext";
import mudConfig from "contracts/mud.config";

const rootElement = document.getElementById("react-root");
if (!rootElement) throw new Error("React root not found");
const root = ReactDOM.createRoot(rootElement);

root.render(
  <div style={{ padding: 24, opacity: 0.7 }}>
    Syncing the Frontier from chain…
  </div>,
);

setup()
  .then(async (result) => {
    root.render(
      <MUDProvider value={result}>
        <App />
      </MUDProvider>,
    );

    if (import.meta.env.DEV) {
      const { mount: mountDevTools } = await import("@latticexyz/dev-tools");
      mountDevTools({
        config: mudConfig,
        publicClient: result.network.publicClient,
        walletClient: result.network.walletClient,
        latestBlock$: result.network.latestBlock$,
        storedBlockLogs$: result.network.storedBlockLogs$,
        worldAddress: result.network.worldContract.address,
        worldAbi: result.network.worldContract.abi,
        write$: result.network.write$,
        recsWorld: result.network.world,
      });
    }
  })
  .catch((err: unknown) => {
    root.render(
      <div style={{ padding: 24, color: "#ff8a8a", whiteSpace: "pre-wrap" }}>
        Could not reach the World.{"\n"}
        {err instanceof Error ? err.message : String(err)}
      </div>,
    );
  });
