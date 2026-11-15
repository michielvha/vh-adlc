export type Shape = { label: string; parent?: string; icon?: string };
export type Link = { from: string; to: string; port?: string; proposed?: boolean };
export type Fixture = {
  name: string;
  question: string;
  source: string;
  shapes: Shape[];
  links: Link[];
  gap?: string;
};
export const aws: Fixture = {
  name: "aws",
  question: "Show the order write path for POST /orders, including the cloud, VPC and tier boundaries.",
  source: `# Orders source inventory
The API Client sends POST /orders over HTTPS port 443.
AWS Cloud contains the Application VPC.
The Application VPC contains the Public Tier and Private Tier.
The Public Tier hosts the Application Load Balancer. Its HTTPS 443 listener routes POST /orders to the Orders API using HTTP 8080.
The Private Tier hosts the Orders API, an ECS service on AWS Fargate, and the Orders Database, Aurora PostgreSQL.
The Orders API writes to the Orders Database using PostgreSQL on port 5432.
A Terraform dependency from the Orders API to the Log Bucket affects deployment ordering. There is no evidence of runtime traffic to that bucket, which is outside this view.
`,
  shapes: [
    { label: "API Client" },
    { label: "AWS Cloud" },
    { label: "Application VPC", parent: "AWS Cloud" },
    { label: "Public Tier", parent: "Application VPC" },
    { label: "Private Tier", parent: "Application VPC" },
    { label: "Application Load Balancer", parent: "Public Tier", icon: "application_load_balancer" },
    { label: "Orders API", parent: "Private Tier", icon: "fargate" },
    { label: "Orders Database", parent: "Private Tier", icon: "aurora" },
  ],
  links: [
    { from: "API Client", to: "Application Load Balancer", port: "443" },
    { from: "Application Load Balancer", to: "Orders API", port: "8080" },
    { from: "Orders API", to: "Orders Database", port: "5432" },
  ],
};
export const oci: Fixture = {
  name: "oci-local",
  question: "Show the proposed nightly backup path from the local Proxmox host to OCI.",
  source: `# Proposed backup design
The Local Site contains the Proxmox Host.
The Proxmox Host runs the Application VM and Backup VM.
The Application VM hands off a nightly archive to the Backup VM. No protocol or port has been selected for this handoff.
OCI contains a Backup VCN and an Object Storage bucket outside the VCN.
The Backup VCN contains the OCI Compute VM, which relays the upload.
The Backup VM sends the archive to the OCI Compute VM over HTTPS 443.
The OCI Compute VM writes to Object Storage over HTTPS 443.
The restore path is unresolved. No restore endpoints or direction have been agreed.
`,
  shapes: [
    { label: "Local Site" },
    { label: "Proxmox Host", parent: "Local Site" },
    { label: "Application VM", parent: "Proxmox Host" },
    { label: "Backup VM", parent: "Proxmox Host" },
    { label: "OCI" },
    { label: "Backup VCN", parent: "OCI" },
    { label: "OCI Compute VM", parent: "Backup VCN", icon: "stencil(" },
    { label: "Object Storage", parent: "OCI", icon: "stencil(" },
  ],
  links: [
    { from: "Application VM", to: "Backup VM", proposed: true },
    { from: "Backup VM", to: "OCI Compute VM", port: "443", proposed: true },
    { from: "OCI Compute VM", to: "Object Storage", port: "443", proposed: true },
  ],
  gap: "restore",
};
export const incomplete: Fixture = {
  name: "missing-link",
  question: "Show which connection carries the restore from OCI to the local service. If you need input, tell me what is missing.",
  source: "# Restore notes\nThere is an OCI bucket and a local service. The connection, initiating component and direction of restore traffic are unspecified.\n",
  shapes: [],
  links: [],
  gap: "restore",
};
