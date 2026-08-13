import { createFileRoute, redirect } from "@tanstack/react-router";

/** Former Sector Guidance page — merged into Helpline. */
export const Route = createFileRoute("/sector-guidance")({
  beforeLoad: () => {
    throw redirect({ to: "/helpline", hash: "guidance" });
  },
});
