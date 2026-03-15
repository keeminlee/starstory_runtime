# GitHub Actions Secrets Contract

These secret names are canonical and must not change.

Deploy workflows depend on them.

| Secret Name   | Purpose                         | Example |
|---------------|---------------------------------|---------|
| EC2_PORT      | SSH port for EC2 instance       | 22 |
| EC2_SSH_HOST  | EC2 public hostname/IP          | ec2-xx-xx-xx.compute.amazonaws.com |
| EC2_SSH_USER  | SSH user on EC2                 | meepo |
| EC2_SSH_KEY   | Private SSH key for deployment  | (private key) |

Rules:
- Secret names must match exactly.
- Workflows must reference these names.
- If infrastructure changes, update this document first.