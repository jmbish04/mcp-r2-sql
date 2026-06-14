/analyzing-data  /data-viz  /data-storytelling  



OK, the charts that have been drafted here are what I would consider low level, unusable, no value -- essentially hello world demos to show the api is passing throug to the frontend charts. 



You are now to act as a team of data scientist, business intelligence analyst, home remodel expert, building permit expediter & consultant -- /brainstorming brainstorming through the lens of a homeowner to build an interactive data as a tool interface that is far more advanced than a simple dashboard  -- this interactive tool must begin with an ai agent asking the user (a san francisco homeowner) questions to clarify the homeowners goal in leveraging the DBI data -- planning for a home remodel, finding reputable contractors / weeding out bad faith contractors, understanding total permit time from application submittal to final inspection, understanding which inspectors have appeared in their neighborhood for all time and identifying inspectors who are shown to issue many violations/few inspections/avg inspections and/or where addenda is complicated (in order to help homeowner understand the dbi culture in their area since DBI has been investigated by the FBI many times for corruption) -- finding permits / contractors  that are similar to the project the homeowner is planning, etc etc  



You and your team of subagents are to prepare an implementation plan to retrofit this new series of frontend pages and mcp tools that empower an agentic driven experience customized to the SF homeowner user based on their goals that the agent establishes via chat in assistant-ui. These chats should be threaded and indexed in d1 tables (d1.threads, d1.messages (fk to thread), d1.thread_data_plans (fk to thread and messages) -- where the agent records evolving plans from the conversations ---- by doing this, the frontend will allow the user to toggle between the stated goals established on various threads so that the frontend is able to serve a multi-purpose bespoke experience. 



This new agentic driven story telling and actionable insights frontend custom tailored to the established user need of each chat thread should be rich with various types of meaningful and interactive charts and the user should be able to ask for changes to the charts and story telling etc to further customize it via agentic chat -- perhaps by using dynamic workers so that each chat thread has its own content stored in d1 or kv and rendered from that storage location on the frontend -- research dynamic workers with cloudflare-docs mcp tool. 



This team of subagents should perform a deep brainstorming and research session to think through what perspectives a homeowner in san francisco would likely hold given the high cost of living, corruption surrounding the DBI and contractors in the city, and complex regulatory environment making simple things like changing windows difficult to navigate. This sub agent team will then plan and design an agentic context self-serve configuration panel on the frontend (powered by a new d1 table (eg, d1.agentic_sf_context) and api hookups and mcp hookups) -- where this sub agent will seed the new table (eg,  d1.agentic_sf_context) with an exhaustive list of context so that the system comes pre-loaded with an exhaustive set of comprehensive context based on the sf dbi, challenges homeowners must navigate to remodel in san francisco, sf dbi corruption and how to monitor for it via this soda SF data, etc -- with the goal being that the agent that the user chats with / agent that is building the customized story telling for each chat thread is impressively razor focused on providing high impact and highly accurate tooling, oversight, monitoring and delivers actionable insights to the user. In other words, more than understanding a simple data cut like total number of permits with null​ inspection status.



There should be chart components setup as templates -- such as shadcnmap with markers (to mark addresses associated with the permits associated with any filters etc or to add clusters with aggregated counts of permits matching a certain criteria), etc etc 



After the agent has confirmed with the user that its proposed plan is approved based on the chat with user to establish user intent, the backend agent should use dynamic workers to build the bespoke UI/UX found in the proposed (and approved) pan via dynamic workers  -- and after initial delivery of that approved plan, there should be an assistant-ui modal (assistant-ui modal means a button at the bottom right corner of the page allowing the user to continue their chat with the agent to make changes to the delivered content. 



The code written by the agent must match the existing frontend -- astro shadcn dark theme with high contrast chart component colors and high contrast font color on chart label text. 
