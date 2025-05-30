import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TFolder, TFile } from 'obsidian';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TwitterDiaryPluginSettings {
	dataPath: string;
	metadataPath: string,
	diaryPath: string,
}

const DEFAULT_SETTINGS: TwitterDiaryPluginSettings = {
	dataPath: '/Users/you/Archive/twitter-2025-03-14-3mn8m83n29m32mk032m03/data',
	metadataPath: 'Assets/Twitter',
	diaryPath: 'Daily Log',
}

export default class TwitterDiaryPlugin extends Plugin {
	settings: TwitterDiaryPluginSettings;

	async onload() {
		await this.loadSettings();
		this.registerMarkdownPostProcessor((element, context) => {
			const currentPath = context.sourcePath;
			if (this.isDailyLogNote(currentPath)) {
				// FIX: change to << [[YYYY-MM-DD]] | [[YYYY-MM-DD]] >>
				if (
					element.textContent?.contains("<<") &&
					element.textContent?.contains(">>")
				) {
					this.injectTwitterContent(element, currentPath);
				}
			}
		});

		this.addSettingTab(new TwitterDiarySettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	isDailyLogNote(filePath: string): boolean {
		const a = new RegExp(`${this.settings.diaryPath}/\\d+/\\d{4}-\\d{2}-\\d{2}\\.md$`);
		const b = new RegExp(`${this.settings.diaryPath}/\\d{4}-\\d{2}-\\d{2}\\.md$`);
		return a.test(filePath) || b.test(filePath);
	}

	isDuringDST(date: Date) {
		// TODO: make it return TRUE if date is after this bill passes:
		// TODO: let users pick timezone
		// https://www.congress.gov/bill/119th-congress/house-bill/139
		
		let early = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
		let middle = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
		return Math.max(early, middle) !== date.getTimezoneOffset();
	}

	toESTDateString(timestamp: string) {
		const date = new Date(timestamp);
		const estOffset = (-4 - (this.isDuringDST(date) ? 1 : 0)) * 60;
		const estDate = new Date(date.getTime() + (estOffset * 60 * 1000));
		return estDate.toISOString().split('T')[0];
	}


	/**
	 * Returns the folder name for a specific date, finding the most recent folder on or before the given date
	 */
	async getFolderForDate(date: Date, offset: number): Promise < string > {
		const baseFolder = this.app.vault.getAbstractFileByPath(this.settings.metadataPath);
		if (!baseFolder || !(baseFolder instanceof TFolder)) {
			return "";
		}

		const folders = baseFolder.children
			.filter(file => file instanceof TFolder)
			.map(folder => folder.name)
			.filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
			.sort();

		const dateString = date.toISOString().split('T')[0];

		if (offset >= folders.length) return "";

		// find closest folder after date (if none exists after the date return fallback)
		for (let i = offset; i < folders.length; i++) {
			if (folders[i] >= dateString) {
				return folders[i];
			}
		}

		// fallback
		return "";
	}

	/**
	 * Gets the avatar image path for a specific date
	 */
	async getAvatar(date: Date): Promise < string > {
		let offset = 0;
		const extensions = ["jpg", "jpeg", "webp", "png"];

		while (true) {
			let folderPath = await this.getFolderForDate(date, offset);

			if (folderPath) {
				for (const ext of extensions) {
					const avatarPath = `${this.settings.metadataPath}/${folderPath}/avatar.${ext}`;
					if (await this.app.vault.adapter.exists(avatarPath)) {
						const file = this.app.vault.getAbstractFileByPath(avatarPath);
						if (file instanceof TFile) {
							return this.app.vault.getResourcePath(file);
						}
					}
				}
				offset++;
			} else {
				// extensions
				for (const ext of extensions) {
					const avatarPath = `${this.settings.metadataPath}/avatar.${ext}`;
					if (await this.app.vault.adapter.exists(avatarPath)) {
						const file = this.app.vault.getAbstractFileByPath(avatarPath);
						if (file instanceof TFile) {
							return this.app.vault.getResourcePath(file);
						}
					}
				}
				// lol fallback (like, fallback fallback)
				return "https://bigrat.monster/media/bigrat.jpg";
			}
		}
	}

	/**
	 * Gets the username for a specific date
	 */
	async getUsername(date: Date): Promise < string > {
		let offset = 0;
		while (true) {
			let folderPath = await this.getFolderForDate(date, offset);
			if (folderPath) {
				const mdPath = `${this.settings.metadataPath}/${folderPath}/${folderPath}.md`;
				if (await this.app.vault.adapter.exists(mdPath)) {
					const fileContent = await this.app.vault.adapter.read(mdPath);
					const lines = fileContent.split('\n');
					if (lines[0] && lines[0].trim() !== "") {
						return lines[0];
					}
				}
				offset++;
			} else {
				const mdPath = `${this.settings.metadataPath}/Twitter.md`;
				if (await this.app.vault.adapter.exists(mdPath)) {
					const fileContent = await this.app.vault.adapter.read(mdPath);
					const lines = fileContent.split('\n');
					if (lines[0] && lines[0].trim() !== "") {
						return lines[0];
					}
				}
				return "no username found";
			}
		}
	}

	/**
	 * Gets the handle for a specific date
	 */
	async getHandle(date: Date): Promise < string > {
		let offset = 0;
		while (true) {
			let folderPath = await this.getFolderForDate(date, offset);
			if (folderPath) {
				const mdPath = `${this.settings.metadataPath}/${folderPath}/${folderPath}.md`;
				if (await this.app.vault.adapter.exists(mdPath)) {
					const fileContent = await this.app.vault.adapter.read(mdPath);
					const lines = fileContent.split('\n');
					if (lines[1] && lines[1].trim() !== "") {
						return lines[1];
					}
				}
				offset++;
			} else {
				const mdPath = `${this.settings.metadataPath}/Twitter.md`;
				if (await this.app.vault.adapter.exists(mdPath)) {
					const fileContent = await this.app.vault.adapter.read(mdPath);
					const lines = fileContent.split('\n');
					if (lines[1] && lines[1].trim() !== "") {
						return lines[1];
					}
				}
				return "cannotfindhandle";
			}
		}
	}

	async injectTwitterContent(element: HTMLElement, filePath: string) {
		try {
			const filename = path.basename(filePath, '.md');
			const date = new Date(filename);

			if (!isNaN(date.getTime())) {

				const tweets = await this.getTweetsForDate(date);
				let myAvatar = await this.getAvatar(date);
				let myUsername = await this.getUsername(date);
				let myHandle = await this.getHandle(date);
				let myCurrentHandle = await this.getHandle(new Date());



				for (let i in tweets) {
					const tweet = tweets[i];
					const tweetContainer = document.createElement('div');
					tweetContainer.className = 'tweet-container';
					tweetContainer.style.cssText = 'border: 1px solid #e1e8ed; border-radius: 12px; padding: 16px; margin-bottom: 16px; max-width: 500px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #fff;';

					const header = document.createElement('div');
					header.className = 'tweet-header';
					header.style.cssText = 'display: flex; align-items: center; margin-bottom: 12px;';

					const avatar = document.createElement('img');
					avatar.src = myAvatar;
					avatar.style.cssText = 'width: 48px; height: 48px; border-radius: 50%; margin-right: 12px;';

					const userInfo = document.createElement('div');
					const username = document.createElement('div');
					username.textContent = myUsername;
					username.style.cssText = 'font-weight: bold; color: #14171a; font-size: 15px;';

					const handle = document.createElement('div');
					handle.textContent = "@" + myHandle;
					handle.style.cssText = 'color: #657786; font-size: 14px;';

					userInfo.appendChild(username);
					userInfo.appendChild(handle);

					header.appendChild(avatar);
					header.appendChild(userInfo);

					const content = document.createElement('div');
					content.className = 'tweet-content';


					// #blue

					let tweetText = tweet.text;
					tweetText = tweetText.replace(/#(\w+)/g, '<span style="color: #1DA1F2; font-weight: 500;">#$1</span>');
					tweetText = tweetText.replace(/@(\w+)/g, '<span style="color: #1DA1F2; font-weight: 500;">@$1</span>');
					tweetText = tweetText.replace(/[\u200B]+([A-Za-z0-9+/=]+)[\u200B]+/g, (match, content) => {try {return Buffer.from(content, "base64").toString("utf8");} catch (e) {return content;}});
					
					// urls
					const mediaUrlRegex = /https:\/\/t\.co\/\w+/g;
					const mediaUrls = tweet.text.match(mediaUrlRegex) || [];

					if (mediaUrls.length > 0) {
						for (const url of mediaUrls) {
							tweetText = tweetText.replace(url, '');
						}
						tweetText = tweetText.trim();
					}

					content.innerHTML = tweetText;
					content.style.cssText = 'margin-bottom: 12px; line-height: 1.4; font-size: 16px; color: #14171a; white-space: pre-wrap; word-wrap: break-word;';

					// footer
					const statsContainer = document.createElement('div');
					statsContainer.className = 'tweet-stats';
					statsContainer.style.cssText = 'display: flex; margin-top: 12px; border-top: 1px solid #e1e8ed; padding-top: 12px;';

					// rt
					const retweetsContainer = document.createElement('div');
					retweetsContainer.style.cssText = 'display: flex; align-items: center; margin-right: 24px; color: #657786;';
					retweetsContainer.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#657786"><g><path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.336-.75-.75-.75z"></path></g></svg>' +
						'<span style="margin-left: 6px; font-size: 14px;">' + tweet.retweets + '</span>';

					// likes
					const likesContainer = document.createElement('div');
					likesContainer.style.cssText = 'display: flex; align-items: center; margin-right: 24px; color: #657786;';
					likesContainer.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#657786"><g><path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12zM7.354 4.225c-2.08 0-3.903 1.988-3.903 4.255 0 5.74 7.034 11.596 8.55 11.658 1.518-.062 8.55-5.917 8.55-11.658 0-2.267-1.823-4.255-3.903-4.255-2.528 0-3.94 2.936-3.952 2.965-.23.562-1.156.562-1.387 0-.014-.03-1.425-2.965-3.954-2.965z"></path></g></svg>' +
						'<span style="margin-left: 6px; font-size: 14px;">' + tweet.likes + '</span>';

					// Share icon
					const shareContainer = document.createElement('div');
					shareContainer.style.cssText = 'display: flex; align-items: center; color: #657786;';

					shareContainer.innerHTML = '<a href="' + "https://x.com/" + myCurrentHandle + "/status/" + tweet.id + '" style="display: inline-flex; align-items: center;"><svg style="vertical-align: middle;" viewBox="0 0 24 24" width="18" height="18" fill="#657786"><g><path d="M17.53 7.47l-5-5c-.293-.293-.768-.293-1.06 0l-5 5c-.294.293-.294.768 0 1.06s.767.294 1.06 0l3.72-3.72V15c0 .414.336.75.75.75s.75-.336.75-.75V4.81l3.72 3.72c.146.147.338.22.53.22s.384-.072.53-.22c.293-.293.293-.767 0-1.06z"></path><path d="M19.708 21.944H4.292C3.028 21.944 2 20.916 2 19.652V14c0-.414.336-.75.75-.75s.75.336.75.75v5.652c0 .437.355.792.792.792h15.416c.437 0 .792-.355.792-.792V14c0-.414.336-.75.75-.75s.75.336.75.75v5.652c0 1.264-1.028 2.292-2.292 2.292z"></path></g></svg></a>';

					statsContainer.appendChild(retweetsContainer);
					statsContainer.appendChild(likesContainer);
					statsContainer.appendChild(shareContainer);


					const mediaContainer = document.createElement('div');
					if (tweet.media && tweet.media.length > 0) {
						mediaContainer.className = 'tweet-media';
						mediaContainer.style.cssText = 'margin-top: 10px; margin-bottom: 12px; border-radius: 14px; overflow: hidden;';

						// stupid grid thing
						if (tweet.media.length === 1) {
							// one media
							const mediaWrapper = document.createElement('div');
							mediaWrapper.style.cssText = 'border-radius: 14px; overflow: hidden; border: 1px solid #e1e8ed;';

							if (tweet.media[0].includes('.mp4')) {
								// vid
								const video = document.createElement('video');
								video.controls = true;
								video.autoplay = false;
								video.loop = true;
								video.muted = true;
								video.src = tweet.media[0];
								video.style.cssText = 'width: 100%; max-height: 400px; display: block; object-fit: cover;';
								mediaWrapper.appendChild(video);
							} else {
								// img
								const img = document.createElement('img');
								img.src = tweet.media[0];
								img.style.cssText = 'width: 100%; max-height: 400px; display: block; object-fit: cover;';
								mediaWrapper.appendChild(img);
							}

							mediaContainer.appendChild(mediaWrapper);
						} else if (tweet.media.length === 2) {
							// i stg
							const gridContainer = document.createElement('div');
							gridContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; grid-gap: 2px; border-radius: 14px; overflow: hidden; border: 1px solid #e1e8ed;';

							tweet.media.forEach((mediaUrl, index) => {
								const mediaWrapper = document.createElement('div');
								mediaWrapper.style.cssText = 'aspect-ratio: 1/1; overflow: hidden;';

								if (mediaUrl.includes('.mp4')) {
									const video = document.createElement('video');
									video.controls = true;
									video.autoplay = false;
									video.loop = true;
									video.muted = true;
									video.src = mediaUrl;
									video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(video);
								} else {
									const img = document.createElement('img');
									img.src = mediaUrl;
									img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(img);
								}

								gridContainer.appendChild(mediaWrapper);
							});

							mediaContainer.appendChild(gridContainer);
						} else if (tweet.media.length === 3) {
							// 3 so 1 large 2 small
							const gridContainer = document.createElement('div');
							gridContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; grid-gap: 2px; border-radius: 14px; overflow: hidden; border: 1px solid #e1e8ed; height: 300px;';

							tweet.media.forEach((mediaUrl, index) => {
								const mediaWrapper = document.createElement('div');


								mediaWrapper.style.cssText = 'overflow: hidden;';
								if (index === 0) { mediaWrapper.style.cssText = 'grid-row: span 2; overflow: hidden;'; }

								if (mediaUrl.includes('.mp4')) {
									const video = document.createElement('video');
									video.controls = true;
									video.autoplay = false;
									video.loop = true;
									video.muted = true;
									video.src = mediaUrl;
									video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(video);
								} else {
									const img = document.createElement('img');
									img.src = mediaUrl;
									img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(img);
								}

								gridContainer.appendChild(mediaWrapper);
							});

							mediaContainer.appendChild(gridContainer);
						} else if (tweet.media.length === 4) {
							// 2x2 oh my god
							const gridContainer = document.createElement('div');
							gridContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; grid-gap: 2px; border-radius: 14px; overflow: hidden; border: 1px solid #e1e8ed; height: 300px;';

							tweet.media.forEach((mediaUrl, index) => {
								const mediaWrapper = document.createElement('div');
								mediaWrapper.style.cssText = 'overflow: hidden;';

								if (mediaUrl.includes('.mp4')) {
									const video = document.createElement('video');
									video.controls = true;
									video.autoplay = false;
									video.loop = true;
									video.muted = true;
									video.src = mediaUrl;
									video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(video);
								} else {
									const img = document.createElement('img');
									img.src = mediaUrl;
									img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(img);
								}

								gridContainer.appendChild(mediaWrapper);
							});

							mediaContainer.appendChild(gridContainer);
						} else {
							// woooooooooo (almost done)
							const gridContainer = document.createElement('div');
							gridContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; grid-gap: 2px; border-radius: 14px; overflow: hidden; border: 1px solid #e1e8ed; height: 300px;';

							// only process 4 lol
							tweet.media.slice(0, 4).forEach((mediaUrl, index) => {
								const mediaWrapper = document.createElement('div');
								mediaWrapper.style.cssText = 'overflow: hidden; position: relative;';

								if (mediaUrl.includes('.mp4')) {
									const video = document.createElement('video');
									video.controls = true;
									video.autoplay = false;
									video.loop = true;
									video.muted = true;
									video.src = mediaUrl;
									video.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(video);
								} else {
									const img = document.createElement('img');
									img.src = mediaUrl;
									img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
									mediaWrapper.appendChild(img);
								}

								// Add overlay for the last visible image if there are more
								if (index === 3 && tweet.media.length > 4) {
									const overlay = document.createElement('div');
									overlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center;';

									const overlayText = document.createElement('div');
									overlayText.textContent = '+' + (tweet.media.length - 4);
									overlayText.style.cssText = 'color: white; font-size: 24px; font-weight: bold;';

									overlay.appendChild(overlayText);
									mediaWrapper.appendChild(overlay);
								}

								gridContainer.appendChild(mediaWrapper);
							});

							mediaContainer.appendChild(gridContainer);
						}
					}




					// Timestamp
					const timestampContainer = document.createElement('div');
					timestampContainer.className = 'tweet-timestamp';

					const tweetDate = new Date(tweet.timestamp);
					const formattedDate = tweetDate.toLocaleString('en-US', {
						hour: 'numeric',
						minute: 'numeric',
						hour12: true,
						day: 'numeric',
						month: 'short',
						year: 'numeric'
					});

					timestampContainer.textContent = formattedDate;
					timestampContainer.style.cssText = 'color: #657786; font-size: 14px; margin-top: 12px;';

					tweetContainer.appendChild(header);
					tweetContainer.appendChild(content);
					if (tweet.media && tweet.media.length > 0) {
						tweetContainer.appendChild(mediaContainer);
					}

					tweetContainer.appendChild(statsContainer);
					tweetContainer.appendChild(timestampContainer);

					element.appendChild(tweetContainer);
				}
				if (tweets.length == 0) {
					// new Notice("No tweets today!");
				}
			}
		} catch (error) {
			console.error('Error injecting Twitter content:', error);
		}
	}

	async getTweetsForDate(date: Date): Promise < {
		text: string,
		timestamp: string,
		likes: number,
		retweets: number,
		id: string,
		media: string[]
	} [] > {
		try {
			// date in YYYY-MM-DD format
			const dateString = date.toISOString().split('T')[0];
			//new Notice("Fetching tweets for " + dateString.toString() + "...");
			const tweetDataPath = path.join(this.settings.dataPath, 'tweets.js');
			let tweetData = await fs.readFile(tweetDataPath, 'utf8');
			tweetData = tweetData.replace(/^window\.YTD\.tweets\.part0\s*=\s*/, '');
			const tweets = JSON.parse(tweetData);

			return tweets
				.filter((tweet: any) => {
					const current = (this.toESTDateString(tweet.tweet.created_at) === dateString);
					const notInReply = (tweet.tweet["in_reply_to_status_id"] == null);
					const retweeted = (tweet.tweet['full_text'] && tweet.tweet['full_text'].startsWith("RT @"));
					const quotingATweet = tweet.tweet.entities &&
						tweet.tweet.entities.urls &&
						tweet.tweet.entities.urls.some((url: {
								expanded_url: string | string[];
							}) =>
							url.expanded_url &&
							(url.expanded_url.includes('twitter.com') ||
								url.expanded_url.includes('x.com'))
						);

					return current && notInReply && !retweeted && !quotingATweet;
				})
				.map((tweet: any) => {
					const tweetObj = tweet.tweet;
					const mediaUrls: string[] = [];

					if (tweetObj.extended_entities && tweetObj.extended_entities.media) {
						tweetObj.extended_entities.media.forEach((media: any) => {
							if (media.type === 'photo') {
								mediaUrls.push(media.media_url_https);
							} else if (media.type === 'animated_gif' || media.type === 'video') {
								if (media.video_info && media.video_info.variants && media.video_info.variants.length > 0) {
									const sortedVariants = media.video_info.variants
										.filter((variant: any) => variant.content_type === 'video/mp4')
										.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

									if (sortedVariants.length > 0) {
										mediaUrls.push(sortedVariants[0].url);
									}
								}
							}
						});
					}
					
					let content = tweetObj.full_text;
					tweetObj.entities.urls.forEach((url: {expanded_url: string | string[]; url: string}) => {
						// Replace t.co URL with expanded URL and style it
						const shortUrl = url.url; // The t.co URL in the tweet text
						const expandedUrl = Array.isArray(url.expanded_url) ? url.expanded_url[0] : url.expanded_url;
						
						content = content.replace(
							shortUrl, 
							// lol this is so dumb. i base64 the url and wrap it in a zwsp
							`​${Buffer.from(`<a href="${expandedUrl}" style="color: #1DA1F2; font-weight: 500; text-decoration: none;">${expandedUrl}</a>`).toString('base64')}​`
						);
					});
					
					return {
						text: content,
						timestamp: tweetObj.created_at,
						likes: parseInt(tweetObj.favorite_count) || 0,
						retweets: parseInt(tweetObj.retweet_count) || 0,
						id: tweetObj.id,
						media: mediaUrls
					};
				}).sort().reverse(); // chronological
		} catch (error) {
			new Notice("Error fetching tweets");
			console.error('Error fetching tweets:', error);
			return [];
		}
	}
}

class TwitterDiarySettingTab extends PluginSettingTab {
	plugin: TwitterDiaryPlugin;

	constructor(app: App, plugin: TwitterDiaryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {
			containerEl
		} = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName('Data Path')
			.setDesc('Absolute path to the twitter data archive')
			.addText(text => text
				.setPlaceholder('/path/to/data')
				.setValue(this.plugin.settings.dataPath)
				.onChange(async (value) => {
					this.plugin.settings.dataPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Metadata Path')
			.setDesc('Absolute path to your metadata archive')
			.addText(text => text
				.setPlaceholder('/path/to/metadata')
				.setValue(this.plugin.settings.metadataPath)
				.onChange(async (value) => {
					this.plugin.settings.metadataPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Diary Path')
			.setDesc('Absolute path to your diary')
			.addText(text => text
				.setPlaceholder('/path/to/diary')
				.setValue(this.plugin.settings.diaryPath)
				.onChange(async (value) => {
					this.plugin.settings.diaryPath = value;
					await this.plugin.saveSettings();
				}));

	}
}