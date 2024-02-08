# OmnivoreToGhostSync

OmnivoreToGhostSync is a Cloud Function designed to seamlessly integrate the bookmarking service [Omnivore](https://omnivore.app) with the [Ghost blogging platform](https://ghost.org). This project simplifies the process of publishing curated links and annotations from Omnivore directly to a Ghost blog, making it ideal for bloggers who want a lightweight mechanism to easily post links and brief commentary (when saving a bookmark.) 

Note: It's worth reading [this blog post which contains additional details](https://danielraffel.me/2024/01/30/intriguing-stuff/). This repository only contains the code necessary to technically integate Omnivore with Ghost. To surface the content Omnivore publishes to Ghost additional work is required which is described at a high-level below in the usage section. Example code is linked to in the blog post which should assist with getting up and running on your Ghost instance.

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
- Quite a few additional things were necessary to integrate posts with my blog on Ghost.org. It included modifying a page to host links.hbs file and rollup the posts, updating routes.yaml to link to the page and the rss feed, creating the rss feed and updating links.hbs to surface the custom RSS feed. Those adjustments are described in [this blog post](https://danielraffel.me/2024/01/30/intriguing-stuff/).
- I had to adapt my approach to the Omnivore GraphQL API, ensuring that posts on Ghost include HTML metadata for parsing by a cloud function. This function checks for the Omnivore slug, found within a post's HTML as data-page-id, to decide whether a post requires creation or an update. For deletion decisions, it looks for the PageID, marked in the HTML as data-page-delete-id. Given the rarity of modifying old links, Ghost only searches through the HTML of the ten latest posts tagged with 'links' for create, update or delete actions.

## Displaying the Data on A Ghost Blog
- To display the content on my blog at [danielraffel.me/links](danielraffel.me/links), I updated the [routes.yaml](https://gist.github.com/danielraffel/b9fcc4f91e0ce11737a67cb8200217e4) file. The routes file: a) Links to a slightly modified [RSS feed](https://github.com/danielraffel/Dawn-mod-main/blob/main/links/rss.hbs) containing a page specific Title. b. Establishes the collection where the `/links` page will live.
- I also created [links.hbs](https://github.com/danielraffel/Dawn-mod-main/blob/main/links.hbs) to rollup all the posts tagged with links on Ghost. I used JavaScript to group posts by the reverse, chronological date they were saved to Omnivore and to format the links in a style similar to Daring Fireball, where the post title leads to the external site.
- Since I wanted the `/links` page to include metadata linking to a custom RSS feed, so someone could copy/paste the URL from the that page to their feed reader and subscribe to an RSS for just the links, I had to [come up with a novel solution](https://github.com/danielraffel/Dawn-mod-main/commit/5317e883a74c33ab260135a13b64613b9d0900a0) which required some workarounds that I'm not happy about. Hopefully, I'll discover better ways to do this in the future but for now I don't see how to link to a custom RSS feed on Ghost other than to hack the header like I did.

## Local Testing
- Uncomment the local server code in `index.js` if you wish to run the application locally for testing purposes.
