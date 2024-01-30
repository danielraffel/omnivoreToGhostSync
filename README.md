[Blog Post with Additional Details](https://danielraffel.me/2024/01/30/intriguing-stuff/)

# OmnivoreToGhostSync

OmnivoreToGhostSync is a Cloud Function designed to seamlessly integrate the bookmarking service [Omnivore](https://omnivore.app) with the [Ghost blogging platform](https://ghost.org). This project simplifies the process of publishing curated links and annotations from Omnivore directly to a Ghost blog, making it ideal for bloggers who want a lightweight mechanism to easily post links and brief commentary (when saving a bookmark.)

## Features

- **Automated Synchronization**: When you bookmark something in Omnivore with an annotation and a custom label, it's automatically added to your Ghost blog.
- **Simple Workflow**: If you use Omnivore for bookmarking you can post to your blog anywhere that you use Omnivore (eg desktop, mobile and web.)
- **Content Formatting**: Format links using a [canonical URL](https://ghost.org/changelog/canonical-urls/) in a style similar to popular linkrolls where the posts title leads directly to the external site.
- **RSS Feed Compatibility**: Expands Ghost's RSS feed system, enabling ability to host a custom RSS feed with this specific content.

## Technical Details

This project utilizes a Cloud Function hosted on Google Cloud, triggered by Omnivore's webhook. It retrieves details from the Omnivore API, processes the content, and posts it to the Ghost blog via the Ghost Admin API. 

Key components:
- **Google Cloud Functions**: For hosting the serverless function.
- **Node.js Backend**: Leverages Express.js for handling HTTP requests.
- **[Omnivore Webhook](https://docs.omnivore.app/integrations/webhooks.html)**: To trigger the cloud function.
- **[Omnivore GraphQL API](https://docs.omnivore.app/integrations/api.html)**: To fetch bookmark details.
- **[Ghost Admin API](https://ghost.org/docs/admin-api/)**: For posting content to your Ghost blog.

## Getting Started

1. **Installation**
   Clone the repository and install dependencies:
   ```
   git clone https://github.com/danielraffel/omnivoreToGhostSync.git
   cd omnivore-to-ghost-sync
   ```

2. **Configuration**
   Edit `index.js` and configure with your details.
  
  ```
url: 'https://danielraffel.me', // Your Ghost instance URL
key: 'YOUR_GHOST_ADMIN_API_KEY', // Replace with your Ghost Admin API key https://ghost.org/docs/admin-api/
version: "v5.0" // Specify the version of your Ghost instance
  
const OMNIVORE_API_URL = 'https://api-prod.omnivore.app/api/graphql'; // Leave as is unless running a hosted Omnivore instance then change it to that!
const OMNIVORE_AUTH_TOKEN = 'YOUR_OMNIVORE_AUTH_TOKEN'; // Replace with your Omnivore API token https://docs.omnivore.app/integrations/api.html#getting-an-api-token
const GLOBAL_TIME_ZONE = 'America/Los_Angeles'; // Replace with your timezone so that the create date matches your blogs timezone
const OMNIVORE_LABEL_NAME = 'ghost'; // Replace 'ghost' with the label name you want to tag your links in Omnivore to appear on your Ghost blog 

  ```

4. **Deployment**
   Use the provided [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) command to deploy the function to Google Cloud Functions. Before running update `YOUR-GCP-PROJECT-ID@appspot.gserviceaccount.com` in the command below with your service account email address.

  ```
  gcloud functions deploy omnivoreToGhostSync \
   --gen2 \
   --trigger-http \
   --entry-point omnivoreToGhostSync \
   --runtime nodejs18 \
   --region us-central1 \
   --allow-unauthenticated \
   --service-account YOUR-GCP-PROJECT-ID@appspot.gserviceaccount.com \
   --source .
  ```

## Usage

- Configure the necessary parameters in `index.js` before deployment.
- Deploy the function to Google Cloud Functions.
- Bookmark items in Omnivore with annotations and tags; these will be synced to your Ghost blog automatically.
- Quite a few additional things were necessary to integrate posts with my blog on Ghost.org. Those adjustments are described in [this blog post](https://danielraffel.me/2024/01/30/intriguing-stuff/)

## Local Testing
- Uncomment the local server code in `index.js` if you wish to run the application locally for testing purposes.
