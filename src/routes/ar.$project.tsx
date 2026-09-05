import { createFileRoute } from "@tanstack/react-router";
import { ARViewer } from "@/pages/ARViewer";
import { getProject } from "@/projects";

export const Route = createFileRoute("/ar/$project")({
  ssr: false,
  head: ({ params }) => {
    const project = getProject(params.project);
    const title = `${project.name} in AR — ${project.developer}`;
    const description = `View ${project.name}, ${project.location}, as a life-like 3D model in your own space. No app install needed.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: ARProjectRoute,
});

function ARProjectRoute() {
  const { project } = Route.useParams();
  return <ARViewer projectSlug={project} />;
}
