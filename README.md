# Technical Exercises

A collection of small, self-contained projects and exercises I use to keep
practicing and sharpening my engineering skills. Each directory stands on its
own: a focused implementation of a pattern, library, or architectural idea I
want to understand more thoroughly. The point of the work is the practice itself
— writing the thing carefully, then coming back to it.

## Projects

### Request Builder

A small HTTPS client for Node.js, built directly on the `https` module rather
than a third-party HTTP library. Requests are assembled with a fluent builder:
method, URL, headers, query parameters, and an optional JSON body. Calling
`invoke()` sends the request and returns a response wrapper that streams the
body and exposes `text()` and `json()` helpers. The supported verbs (`get`,
`post`, `delete`, `patch`) are attached dynamically, so adding another verb does
not require a new hand-written method.

### API Playground

A TypeScript REST API built with Express and organized in layers: routers,
controllers, services, and repositories. Incoming requests are validated with
Zod, and the app applies Helmet, CORS, and Redis-backed rate limiting before
they reach a handler. Persistence is set up with Sequelize and PostgreSQL. The
feature currently in place is a user lookup exposed at `/api/v1/users/:userId`.
