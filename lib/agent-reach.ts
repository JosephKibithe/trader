import { spawnSync } from "child_process";

const MCPORTER_PATH = "/home/joe/.nvm/versions/node/v22.22.0/bin/mcporter";
const TWITTER_PATH = "/home/joe/.local/bin/twitter";
const BILI_PATH = "/home/joe/.local/bin/bili";

// Helper to run a command with the correct environment PATH settings
function runCommand(command: string, args: string[]): string {
  const customPath = [
    "/home/joe/.nvm/versions/node/v22.22.0/bin",
    "/home/joe/miniconda3/bin",
    "/home/joe/.local/bin",
    process.env.PATH || ""
  ].join(":");

  const result = spawnSync(command, args, {
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: customPath,
    },
  });

  if (result.error) {
    console.error(`Command execution error: ${command}`, result.error);
    return `Error executing command: ${result.error.message}`;
  }

  if (result.status !== 0) {
    console.error(`Command returned exit code ${result.status}: ${command}`, result.stderr);
    return `Command error (Exit code ${result.status}): ${result.stderr || result.stdout || "Unknown error"}`;
  }

  return result.stdout || "No output returned.";
}

const MAX_OUTPUT_CHARS = 2500;

function truncate(str: string): string {
  if (str.length <= MAX_OUTPUT_CHARS) return str;
  return str.substring(0, MAX_OUTPUT_CHARS) + "\n\n[Output truncated due to context length/token limits]";
}

export async function executeReachTool(toolName: string, args: Record<string, any>): Promise<string> {
  console.log(`[Reach Tool] Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "search_web":
      case "web_search": {
        const query = args.query;
        if (!query) return "Error: query parameter is required.";
        // Run mcporter call exa.web_search_exa --args '{"query": "...", "numResults": 2}'
        const payload = JSON.stringify({ query, numResults: 2 });
        const result = runCommand(MCPORTER_PATH, ["call", "exa.web_search_exa", "--args", payload]);
        return truncate(result);
      }

      case "fetch_webpage": {
        const url = args.url;
        if (!url) return "Error: url parameter is required.";
        // Standard Jina Reader curl request
        const result = runCommand("curl", ["-s", `https://r.jina.ai/${url}`]);
        return truncate(result);
      }

      case "search_twitter": {
        const query = args.query;
        if (!query) return "Error: query parameter is required.";
        // Run twitter search "<query>" -n 5
        const result = runCommand(TWITTER_PATH, ["search", query, "-n", "5"]);
        return truncate(result);
      }

      case "search_bilibili": {
        const query = args.query;
        if (!query) return "Error: query parameter is required.";
        // Run bili search "<query>" --type video -n 3 --yaml
        const result = runCommand(BILI_PATH, ["search", query, "--type", "video", "-n", "3", "--yaml"]);
        return truncate(result);
      }

      default:
        return `Error: Unknown tool: ${toolName}`;
    }
  } catch (err: any) {
    console.error(`Error in executeReachTool: ${toolName}`, err);
    return `Error executing tool ${toolName}: ${err?.message || err}`;
  }
}
