import praw
import os
import numpy
import matplotlib.pyplot as plt

def round_down(num, divisor):
    return num - (num%divisor)

def calculate_percentage(total, *nums):
    summed = sum(nums)
    return round(summed/total * 100, 2)

def getStats():
    time_interval_count = { x:0 for x in range(0, 181, 5) }
    time_interval_count_10 = { x:0 for x in range(0, 10, 1) }
    offsets = []

    thread_count = 0
    reddit = praw.Reddit(client_id=os.environ['CLIENT_ID'],
                        client_secret=os.environ['CLIENT_SECRET'],
                        password=os.environ['PASS'],
                        username=os.environ['USER'],
                        user_agent='ama script by /u/' + os.environ['USER'])
    for submission in reddit.subreddit('IAmA').top('all', limit=200):
        if "AMA REQUEST" not in submission.title.upper():
            thread_count += 1
            submission.comments.replace_more(limit=0)
            for top_level_comment in submission.comments:
                replies = top_level_comment.replies
                replies.replace_more(limit=0)
                for reply in replies:
                    if reply.author == submission.author:
                        offset = top_level_comment.created - submission.created
                        offsets.append(int(offset/60))
                        key = round_down(int(offset/60), 5)
                        key_10 = round_down(int(offset/60), 1)
                        if (key < 180):
                            time_interval_count[key] += 1
                        else:
                            time_interval_count[180] += 1

                        if (key_10 < 10):
                            time_interval_count_10[key_10] += 1

    f = open("../data/data.txt", "w", encoding="utf-8")
    f.write("Printing values in first dict: \n")
    for key in sorted(time_interval_count):
        f.write(str(key) + " " + str(time_interval_count[key]) + "\n")
    f.write("\nPrinting values in second dict: \n")
    for key in sorted(time_interval_count_10):
        f.write(str(key) + " " + str(time_interval_count_10[key]) + "\n")

    total = sum(time_interval_count.values())
    median = numpy.median(offsets)
    mean = numpy.average(offsets)
    std = numpy.std(offsets)
    f.write("\nNumber of comments: " + str(total) + "\n")
    f.write("Median: " + str(median) + " Mean: " + str(mean) + "\n")
    f.write("Std Dev: " + str(std) + "\n")
    f.write("Counted threads: " + str(thread_count) + "\n")

    f.write("Proportion of answers for comments within 5 minutes: " +
        str(calculate_percentage(total, time_interval_count[0])) + "% (" +
        str(time_interval_count[0]) + "/" + str(total) + ")\n")
    f.write("Proportion of answers for comments within 10 minutes: " +
        str(calculate_percentage(total, time_interval_count[0], time_interval_count[5]))
        + "% (" + str(time_interval_count[0] + time_interval_count[5]) + "/" +
        str(total) + ")\n")
    f.close()

    showHistogram(offsets)

def showHistogram(offsets):
    weights = numpy.ones_like(offsets)/len(offsets)
    plt.hist(offsets, bins=[x for x in range(0, 181, 5)], weights=weights)
    plt.xlabel("Time Offset")
    plt.ylabel("Proportion")
    plt.grid(True)
    plt.axis([0, 180, 0, 0.3])
    plt.show()

def main():
    getStats()

if __name__ == '__main__':
    main()
