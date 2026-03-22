module.exports = {
  apps: [
    {
      name: "scraper-server",
      cwd: "./server",
      script: "node_modules/.bin/tsx",
      args: "src/index.ts",
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      env_file: "./.env",
      watch: ["src"],
      watch_delay: 1000,
    },
    {
      name: "scraper-client",
      cwd: "./client",
      script: "node_modules/.bin/vite",
      args: "--port 5173",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
