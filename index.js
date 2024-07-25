const express = require('express');
const bodyParser = require('body-parser');
const GhostAdminAPI = require('@tryghost/admin-api');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
const { Remarkable } = require('remarkable');
const md = new Remarkable();
app.use(bodyParser.json());

// Configure variables to use the Ghost Admin API
const api = new GhostAdminAPI({
    url: 'https://danielraffel.me', // Your Ghost instance URL
    key: 'YOUR_GHOST_ADMIN_API_KEY', // Replace with your Ghost Admin API key https://ghost.org/docs/admin-api/
    version: "v5.0" // Specify the version of your Ghost instance
});

// Configure variables to use the Omnivore API, edit the PageID of your Ghost Page, and convert date to Blog timezone
const OMNIVORE_API_URL = 'https://api-prod.omnivore.app/api/graphql'; // Leave as is unless running a hosted Omnivore instance then change it to that!
const OMNIVORE_AUTH_TOKEN = 'YOUR_OMNIVORE_AUTH_TOKEN'; // Replace with your Omnivore API token https://docs.omnivore.app/integrations/api.html#getting-an-api-token
const GLOBAL_TIME_ZONE = 'America/Los_Angeles'; // Replace with your timezone so that the create date matches your blogs timezone
const OMNIVORE_LABEL_NAME = 'ghost'; // Replace 'ghost' with the label name you want to tag your links in Omnivore to appear on your Ghost blog

// Entry point for the Cloud Function
exports.omnivoreToGhostSync = async (req, res) => {
    try {
        console.log("Request body:", JSON.stringify(req.body, null, 2));
        
        let articleIdentifier;

        if (req.body.page?.slug) {
            articleIdentifier = req.body.page.slug;
        } else if (req.body.highlight?.pageId) {
            articleIdentifier = req.body.highlight.pageId;
        } else if (req.body.label?.pageId) {
            articleIdentifier = req.body.label.pageId;
        } else if (req.body.page?.id) {
            articleIdentifier = req.body.page.id;
        } else {
            console.error('No valid identifier found in the request.');
            return res.status(400).send('Invalid request: Identifier is missing.');
        }

        console.log("Determined articleIdentifier:", articleIdentifier);

        const { action } = req.body;
        const state = req.body.page?.state;
        console.log(`Action: ${action}, State: ${state}`);

        if (action === 'updated' && state === 'DELETED') {
            await updateGhostBlog(null, action, state, articleIdentifier);
            return res.status(200).send('Deletion processed successfully.');
        }

        const graphqlResponse = await queryOmnivoreAPI(articleIdentifier);
        if (!shouldProcess(graphqlResponse, action)) {
            return res.status(200).send('No action required.');
        }

        if (!graphqlResponse || !graphqlResponse.article) {
            console.error('Invalid GraphQL response:', graphqlResponse);
            return res.status(400).send('Invalid GraphQL response');
        }

        const htmlContent = formatToHTML(graphqlResponse);
        await updateGhostBlog(htmlContent, action, state, graphqlResponse.article.slug);

        return res.status(200).send('Update processed successfully.');
    } catch (error) {
        console.error('Error in omnivoreToGhostSync:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Query the Omnivore API for the Bookmark data
async function queryOmnivoreAPI(identifier) {
    console.log("Identifier:", identifier);
    const query = `
      query GetArticle($username: String!, $slug: String!) {
        article(username: $username, slug: $slug) {
          ... on ArticleSuccess {
            article {
              title
              subscription
              originalArticleUrl
              slug
              id
              createdAt
              description
              labels {
                name
              }
              highlights {
                id
                quote
                annotation
              }
            }
          }
          ... on ArticleError {
            errorCodes
          }
        }
      }`;

    console.log("Outgoing GraphQL Query:", query);
    console.log("Query Variables:", { username: "joe", slug: identifier });

    const response = await fetch(OMNIVORE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': OMNIVORE_AUTH_TOKEN
      },
      body: JSON.stringify({
        query: query,
        variables: { username: "joe", slug: identifier }
      })
    });

    const data = await response.json();
    console.log("GraphQL Response:", JSON.stringify(data, null, 0));

    if (data.errors) {
        console.error('GraphQL errors:', data.errors);
        throw new Error('GraphQL query returned errors');
    }

    if (!data.data || !data.data.article) {
        console.error('Unexpected GraphQL response structure:', data);
        throw new Error('Unexpected GraphQL response structure');
    }

    return data.data.article;
}

// Biz Logic to check if the content from Omnivore should be added, updated or deleted from Ghost
function shouldProcess(graphqlResponse, action, state) {
    console.log("Checking if should process, GraphQL Response:", graphqlResponse);

    if (!graphqlResponse || !graphqlResponse.article) {
        console.log('No article found in the GraphQL response, not posting to Ghost');
        return false;
    }

    const hasGhostLabel = graphqlResponse.article.labels.some(label => label.name === OMNIVORE_LABEL_NAME);
    const hasDescription = !!graphqlResponse.article.description;

    if (graphqlResponse.article.labels.some(label => label.name === 'Newsletter')) {
        console.log('Detected a newsletter, not posting to Ghost');
        return false;
    }

    if (action === 'created' || action === 'updated') {
        if (!hasGhostLabel) {
            console.log('Bookmark does not have the ghost label, not posting to Ghost');
            return false;
        }
        if (!hasDescription) {
            console.log('Bookmark does not have a description, not posting to Ghost');
            return false;
        }
        console.log('Detected a bookmark with ghost label and description, posting/updating in Ghost');
        return true;
    }

    if (action === 'updated' && state === 'DELETED') {
        console.log('Detected a deleted bookmark with ghost label, removing from Ghost');
        return true;
    }

    console.log('Action not recognized or not applicable, not posting to Ghost');
    return false;
}

// Create, update or delete the Ghost post
async function updateGhostBlog(article, action, state, slug) {
    console.log(`updateGhostBlog called with slug: ${slug}, action: ${action}, state: ${state}`);
    try {
        if (action === 'updated' && state === 'DELETED') {
            console.log(`Attempting to delete post for Page ID: ${slug} because state is DELETED.`);
            await deletePost(slug);
        } else if (action === 'updated' || action === 'created') {
            if (!article) {
                console.error('Article content is missing, cannot proceed.');
                return;
            }
            await createOrUpdatePost(article, action, slug);
        } else {
            console.error(`Unhandled action: ${action}`);
        }
        console.log("Post processed successfully.");
    } catch (error) {
        console.error(`Error in updateGhostBlog:`, error);
    }
}

// Find existing post by data-page-id in HTML content
async function findPostBySlug(articleSlug) {
    try {
        const tag = 'links';
        const posts = await api.posts.browse({filter: `tag:${tag}`, limit: 10, formats: 'html'});
        const matchingPost = posts.find(post => post.html.includes(`data-page-id="${articleSlug}"`));
        return matchingPost || null;
    } catch (error) {
        console.error(`Error searching for post by data-page-id '${articleSlug}':`, error);
        return null;
    }
}

// Create a new post or update an existing post based on the presence of a matching slug
async function createOrUpdatePost(article, action, slug) {
    console.log(`Attempting to create or update post for slug: ${slug}`);
    const existingPost = await findPostBySlug(slug);

    if (!article || !article.title || !article.html) {
        console.error(`Missing article content for the slug: ${slug}`);
        return;
    }

    let response;

    if (existingPost) {
        console.log(`Found existing post for slug: ${slug}, updating...`);

        const updates = {
            id: existingPost.id,
            html: article.html,
            tags: ['links'],
            updated_at: existingPost.updated_at,
            status: 'published',
            visibility: 'public',
            canonical_url: article.canonicalUrl
        };

        if (existingPost.title !== article.title) {
            updates.title = article.title;
        }

        response = await api.posts.edit(updates, { source: 'html' });
    } else {
        console.log(`No existing post found for slug: ${slug}, creating new post...`);
        response = await api.posts.add({
            title: article.title,
            html: article.html,
            tags: ['links'],
            status: 'published',
            visibility: 'public',
            canonical_url: article.canonicalUrl
        }, { source: 'html' });
    }

    if (response) {
        console.log(`Post for slug: ${slug} processed successfully, action: ${action}.`);
    } else {
        console.error(`Failed to process post for slug: ${slug}, action: ${action}.`);
    }
}

// Find and delete a post by data-page-delete-id
async function deletePost(pageId) {
    try {
        const posts = await api.posts.browse({filter: 'tag:links', limit: 'all', formats: 'html'});
        let found = false;
        for (let post of posts) {
            if (post.html && post.html.includes(`data-page-delete-id="${pageId}"`)) {
                await api.posts.delete({id: post.id});
                console.log(`Deleted post with Page ID: ${pageId}.`);
                found = true;
                break;
            }
        }
        if (!found) {
            console.log(`No post found with Page ID: ${pageId} to delete.`);
        }
    } catch (error) {
        console.error(`Error deleting post with Page ID ${pageId}:`, error);
    }
}

// Converts ISO date from Omnivore to Month Day Year format (January 22, 2024) using blog timezone
function formatDate(isoDateString) {
    const date = new Date(isoDateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric', timeZone: GLOBAL_TIME_ZONE };
    return date.toLocaleDateString('en-US', options);
}

// Converts Omnivore GraphQL response to HTML content for Ghost post
function formatToHTML(graphqlResponse) {
    if (!graphqlResponse || !graphqlResponse.article) {
        console.error('Invalid GraphQL response for formatting HTML:', graphqlResponse);
        return null;
    }

    const article = graphqlResponse.article;
    const formattedDate = formatDate(article.createdAt);

    // Exclude annotations that begin with "###### Summary"
    // I use GenAI to create summaries of my bookmarks and include them as annotations, but I prefer not to publish these so filter them out.
    // For information on configuring auto-summarization, visit: https://danielraffel.me/2024/03/28/using-open-router-with-gemini-1-5/
    // If you do not need to exclude annotations starting with "###### Summary," you can comment out the line below
    const filteredHighlights = article.highlights.filter(h => !h.annotation || !h.annotation.startsWith('###### Summary'));

    // Convert each highlight's quote from Markdown to HTML and wrap with <blockquote>
    const htmlHighlights = filteredHighlights.map(h => {
        let highlightHtml = '';
        if (h.quote) {
            const quoteHtml = md.render(h.quote);
            highlightHtml += `<blockquote>${quoteHtml}</blockquote>`;
        }
        if (h.annotation) {
            highlightHtml += `<p>${h.annotation}</p>`;
        }
        return highlightHtml;
    }).join(' ');

    const htmlContent = `
        <!--kg-card-begin: html-->
        <div class="link-item" 
             data-tag="links" 
             data-page-id="${article.slug}" 
             data-page-delete-id="${article.id}"
             data-title="${article.title}" 
             data-original-url="${article.originalArticleUrl}" 
             data-creation-date="${formattedDate}">
            <p>${article.description}</p>
            ${htmlHighlights}
        </div>
        <!--kg-card-end: html-->`;

    return {
        title: article.title,
        html: htmlContent,
        canonicalUrl: article.originalArticleUrl
    };
}

// // Local server configs for testing
// if (process.env.NODE_ENV === 'development') {
//     const PORT = 8080;
//     app.listen(PORT, () => {
//       console.log(Server running on port ${PORT});
//     });
//   }
// // Command to deploy to Google Cloud Functions using CLI
// gcloud functions deploy omnivoreToGhostSync \
//   --gen2 \
//   --trigger-http \
//   --entry-point omnivoreToGhostSync3 \
//   --runtime nodejs18 \
//   --region us-central1 \
//   --allow-unauthenticated \
//   --service-account YOUR-GCP-PROJECT-ID@appspot.gserviceaccount.com \
//   --source .
